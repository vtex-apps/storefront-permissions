# Auditoria de cobertura de logs — 2026-08-21

| | |
|---|---|
| **Escopo** | `node/` (todo o serviço) |
| **Branch** | `B2BTEAM-3227` |
| **Commit** | `508bff6` |
| **Score** | **85/95 ≈ 89%** |

O denominador são 95 caminhos de erro/decisão julgados: blocos `catch`, `.catch()` e branches de
validação que abortam ou degradam a operação. Caminhos triviais e sem efeito colateral (getters,
formatadores, arquivos de tipo) foram ignorados.

## Resumo

O repositório é, no geral, bem instrumentado. Toda a camada de autenticação (`directives/helper.ts`
e os quatro directives de acesso) e praticamente todos os resolvers de mutation logam com
`logger.error` / `logger.warn` incluindo o objeto `error` e algum identificador que permite achar o
registro afetado.

Os 10 achados abaixo são caminhos onde uma falha real de produção não deixa rastro nenhum — ou deixa
um rastro inútil para debug.

## Achados

| Local | O que o caminho faz | Status | Por quê |
|---|---|---|---|
| `node/resolvers/Queries/Users.ts:592` e `:607` | Resolve role e permissões por e-mail | missing | Com `skipError: true` retorna permissões vazias sem logar; os `logger.warn` existentes só disparam no branch `!skipError` |
| `node/resolvers/Mutations/Users.ts:135` | `getUser` — busca usuário no MasterData | missing | `.catch(() => null)` engole qualquer falha; 3 callers (`:459`, `:512`, `:601`) lançam `'User not found'` fora do `try`, sem log |
| `node/resolvers/Queries/Users.ts:750` | `checkImpersonation` — busca perfil | missing | `.catch(() => null)` vira `{ error: 'User not found' }`, indistinguível de indisponibilidade do Profile System |
| `node/directives/withUserPermissions.ts:24` | Carrega sessão antes de resolver permissões | missing | `.catch(() => null)` sem log nem métrica (o irmão `withSession.ts` emite `SessionMetric` nesse mesmo ponto) |
| `node/resolvers/Queries/Settings.ts:79` | `syncRoles` no setup do app | missing | `.catch(() => [])` faz a UI reportar "roles não configuradas" sem explicar o motivo |
| `node/resolvers/Queries/Roles.ts:59` | `searchRoles` relança erro não-404 | insufficient | `throw new Error(error)` estringa o objeto; o `logger.error` do caller em `:77` grava `[object Object]` |
| `node/utils/metrics/changeTeam.ts:54` | Envio de métrica de troca de time | insufficient | Usa `console.warn`, que não entra no índice estruturado; o equivalente `metrics/session.ts:39` usa `logger.error` |
| `node/resolvers/Queries/Settings.ts:21`, `:94` e `node/resolvers/Mutations/Settings.ts:12` | Leitura de settings no VBase | insufficient | `.catch(() => ({}))` trata 404 de primeira execução e indisponibilidade do VBase da mesma forma |
| `node/utils/LicenseManager.ts:29,50,58,74,119,137` | Cliente do License Manager | missing | Arquivo sem nenhum log; 6 catches retornam `null` / `false` / `{}` em silêncio |
| `node/clients/checkout.ts:276` | `changeToAnonymousUser` | missing | Engole todo erro não-3xx sem log |

Os dois últimos são **código morto no momento desta auditoria**: só `getUserAdminPermissions` e
`checkUserSpecificRole` são chamados do `LicenseManager` (ambos propagam via `statusToError` para o
`catch` logado do `helper.ts`), e `changeToAnonymousUser` não tem chamador no repositório. Por isso
ficaram no fim da lista.

## Verificado e considerado adequado

Registrado aqui para não ser reaberto em auditorias futuras:

- **`node/directives/withSession.ts:26`** — o `.catch(() => null)` é deliberado e está documentado no
  próprio código: foi trocado por `SessionMetric` justamente por volume de log.
- **`node/resolvers/Mutations/Users.ts:80,149,177,222`** — tratam um caso conhecido (entrada
  duplicada, status < 400) e dão `throw error`, caindo nos callers que logam.
- **`node/resolvers/Routes/index.ts:249`** — o early return para usuário sem `orgId` é o caminho
  normal de todo shopper B2C; logar ali seria ruído.
- **`node/resolvers/Routes/index.ts` (`checkPermissions`, `setProfile`)** — cobertura boa, com
  `logger.warn` / `logger.error` em cada branch de falha e contexto suficiente (e-mail, `roleId`,
  `costId`).
- **`node/directives/helper.ts`** — os três catches da validação de token logam com `warn` + `err`.
- **`node/metrics/session.ts` e `node/metrics/auth.ts`** — falha de envio de métrica é logada.

## Correções sugeridas

### 1. `Queries/Users.ts:592` e `:607` — degradação silenciosa de permissões

Achado mais grave. `checkUserPermission` sempre chama essa função com `skipError: true`, então um
usuário que perde acesso não gera nenhuma linha de log.

```typescript
  if (!userData.length) {
    logger.warn({
      email,
      message: 'getRoleAndPermissionsByEmail-userNotFound-degraded',
      module,
    })

    return defaultResponse
  }

  // ...

  if (!userRole) {
    logger.warn({
      email,
      message: 'getRoleAndPermissionsByEmail-roleNotFound-degraded',
      roleId: userData[0].roleId,
    })

    return defaultResponse
  }
```

### 2. `Mutations/Users.ts:135` — `getUser` engole falha do MasterData

A função não recebe `ctx`, então o `logger` precisa entrar como parâmetro:

```typescript
export const getUser = async ({
  masterdata,
  logger,
  params: { email, id, userId },
}: any) => {
  // ...
    .catch((error: any) => {
      logger?.error({
        error,
        message: 'getUser.searchDocumentsError',
        id: id ?? userId,
        email,
      })

      return null
    })
}
```

Nos três call sites (`addOrganizationToUser:457`, `addCostCenterToUser:510`,
`setActiveUserByOrganization:599`), passar `logger` e mover o `throw new Error('User not found')`
para dentro do `try` — ou logar antes de lançar. Hoje esse throw sai da função sem registro algum.

### 3. `Queries/Users.ts:750` — impersonation

```typescript
    const userData: any = await profileSystem
      .getProfileInfo(profile.id.value)
      .catch((error: any) => {
        logger.error({
          error,
          message: 'checkImpersonation.getProfileInfoError',
          profileId: profile.id.value,
        })

        return null
      })
```

### 4. `directives/withUserPermissions.ts:24`

O mais consistente é replicar o que `withSession.ts` já faz: destruturar `logger` de
`context.clients` e emitir `SessionMetric` após o `.catch(() => null)`, para que os dois directives
tenham a mesma visibilidade sobre sessão ausente.

### 5. `Queries/Settings.ts:79`

```typescript
  const roles: any = await syncRoles(ctx).catch((error) => {
    logger.error({
      error,
      message: 'getAppSettings.syncRolesError',
    })

    return []
  })
```

### 6. `Queries/Roles.ts:59`

Trocar `throw new Error(error)` por `throw error` preserva stack e response, e faz o `logger.error`
de `getRole` gravar o erro real. O mesmo padrão aparece em `Users.ts:127,807,877,932` e
`Settings.ts:72`, mas nesses casos o log já aconteceu antes do rethrow, então só o de `Roles.ts`
degrada o registro.

### 7. `utils/metrics/changeTeam.ts:54`

Alinhar com `metrics/session.ts`, recebendo o logger:

```typescript
export const sendChangeTeamMetric = async (
  logger: Logger,
  metricParams: ChangeTeamParams
) => {
  try {
    await sendMetric(buildMetric(metricParams))
  } catch (error) {
    logger.error({
      error,
      message: 'Unable to send change team metric',
    })
  }
}
```

O call site em `Mutations/Users.ts:696` passa a ser `sendChangeTeamMetric(logger, metricParams)`.

### 8, 9 e 10

Baixa prioridade. O item 8 tem impacto pequeno, e os itens 9 e 10 são código sem chamador — vale
revisitar se e quando esses métodos voltarem a ser usados.

## Metodologia

Pré-scan por regex (`entry points`, `catch`, chamadas de log e nível detectado) sobre os 45 arquivos
`.ts` de `node/`, seguido de leitura do contexto em torno de cada ponto sinalizado para julgar em
uma de três categorias:

- **missing** — nenhuma chamada de log no caminho de falha.
- **insufficient** — existe log, mas sem objeto de erro, sem identificador, ou em um canal que não
  chega ao índice estruturado.
- **covered** — log com contexto real em qualquer nível razoável. `warn` em falha esperada e tratada
  conta como coberto tanto quanto `error`.
