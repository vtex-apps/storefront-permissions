# Auditoria de cobertura de logs (revisão independente) — 2026-08-21

| | |
|---|---|
| **Escopo** | `node/` (todo o serviço) |
| **Branch** | `B2BTEAM-3227` |
| **Commit** | `508bff6` |
| **Score** | **86/112 ≈ 77%** (excluindo código morto: 86/105 ≈ 82%) |

Segunda auditoria sobre o **mesmo commit** da
[auditoria anterior](./2026-08-21-log-coverage-audit.md), feita de forma independente para servir de
contraprova. O denominador conta **locais distintos que precisam de log** — tanto os que já têm
(86) quanto os que faltam ou estão insuficientes (26). Caminhos triviais e sem efeito colateral
(getters, formatadores, early returns do fluxo normal, arquivos de tipo) ficam fora.

O score não é comparável ao 89% da auditoria anterior: aquela contou 95 caminhos com granularidade
diferente. As duas conclusões qualitativas coincidem em 8 dos 10 achados originais; as diferenças
estão registradas abaixo.

## Resumo

Confirmo o diagnóstico geral: o serviço é bem instrumentado. A camada de autenticação
(`directives/helper.ts` + os quatro directives de acesso) loga **todo** caminho de negação com
`logger.warn` e contexto rico de métricas, e praticamente todo resolver de mutation loga com
objeto `error` mais um identificador.

Mas encontrei um caminho de falha silenciosa **mais grave que qualquer um dos dez achados
anteriores**, e ele estava fora daquela lista: `setProfile` não tem tratamento de erro no nível
superior, e seis chamadas a clientes externos dentro dele não têm `.catch()` nenhum.

## Achados

| Local | O que o caminho faz | Status | Por quê |
|---|---|---|---|
| `node/resolvers/Routes/index.ts:282-296`, `:21` e `node/services/appSettingsCache.ts:22` | `setProfile` — busca organização, cost center, sales channels, marketing tags, B2B settings e app settings | **missing** | `setProfile` não tem `try/catch` externo e 6 dessas chamadas não têm `.catch()`. Uma indisponibilidade do `b2b-organizations-graphql` derruba **todo** `setProfile` sem uma linha de log do serviço |
| `node/resolvers/Mutations/Users.ts:135` (+ callers `:460`, `:513`, `:602`) | `getUser` — busca usuário no MasterData | missing | `.catch(() => null)` engole a falha; os 3 callers lançam `'User not found'` fora do `try`, sem log |
| `node/resolvers/Queries/Users.ts:607` | Resolve permissões quando o `roleId` do usuário não existe mais | missing | Com `skipError: true` retorna permissões vazias sem log — usuário perde acesso silenciosamente |
| `node/resolvers/Queries/Users.ts:752` | `checkImpersonation` — busca perfil | missing | `.catch(() => null)` vira `{ error: 'User not found' }`, indistinguível de indisponibilidade do Profile System |
| `node/resolvers/Mutations/Users.ts:605` e `node/resolvers/Queries/Settings.ts:76` | Escritas: `updateUserFields` e `vbase.saveJSON` | **missing** | Duas operações de escrita fora de qualquer `try/catch`; a falha vira 500 sem log local |
| `node/directives/withUserPermissions.ts:24` | Carrega sessão antes de resolver permissões | missing | `.catch(() => null)` sem log nem métrica (o irmão `withSession.ts` emite `SessionMetric` nesse mesmo ponto) |
| `node/resolvers/Queries/Settings.ts:79` | `syncRoles` no setup do app | missing | `.catch(() => [])` faz a UI reportar "roles não configuradas" sem explicar o motivo |
| `node/resolvers/Queries/Users.ts:246-250` | `checkCustomerSchema` — query exposta no schema | **missing** | `getLatestSchema` sem `catch` e o branch `'Schema not found'` retorna erro ao cliente sem logar |
| `node/resolvers/Queries/Roles.ts:59` | `searchRoles` relança erro não-404 | insufficient | `throw new Error(error)` estringa o objeto; o `logger.error` do caller em `:77` grava `[object Object]` |
| `node/utils/metrics/changeTeam.ts:54` | Envio de métrica de troca de time | insufficient | Usa `console.warn`, que não entra no índice estruturado; o equivalente `metrics/session.ts:39` usa `logger.error` |
| `node/resolvers/Queries/Settings.ts:21`, `:94` e `node/resolvers/Mutations/Settings.ts:12` | Leitura de settings no VBase | insufficient | `.catch(() => ({}))` trata 404 de primeira execução e indisponibilidade do VBase da mesma forma |
| `node/utils/LicenseManager.ts:29,50,58,74,119,137` | Cliente do License Manager | missing | Arquivo sem nenhum log; 6 catches retornam `null` / `false` / `{}` em silêncio |
| `node/clients/checkout.ts:276` | `changeToAnonymousUser` | missing | Engole todo erro não-3xx sem log |

Os dois últimos continuam sendo **código morto**. Confirmei por busca: `getUserIdByEmail`,
`saveUser`, `deleteUser`, `hasBuyerOrganizationViewRole` e `hasBuyerOrganizationEditRole` não têm
chamador, e `changeToAnonymousUser` também não. Só `getUserAdminPermissions` e
`checkUserSpecificRole` são usados (de `helper.ts:52,58,139,145`), e ambos propagam via
`statusToError` até o `catch` logado de `helper.ts:70`.

## Nota sobre o `master`

O commit auditado (`508bff6`) está **35 commits atrás do `origin/master`** no momento da abertura
deste PR, e o `master` reescreveu `Routes/index.ts` (+467 linhas alteradas) e `Queries/Users.ts`.
Os números de linha acima valem para `508bff6`. Reconferi o achado principal contra o `master`:

- `setProfile` agora envolve cada chamada em `timedSetProfile` (`Routes/index.ts:49`), que tem
  `try/catch` por passo. **O achado continua aberto, mas com outra forma**: o `catch` (`:75`) loga
  em `logger.debug` com `failed: true` e **sem o objeto `error`**, e depois relança. Ou seja, a
  falha vira um evento de timing em nível `debug` — normalmente filtrado em produção — em vez de um
  `logger.error` com o erro. O passo que falhou passou a ser identificável, o erro em si não.
- `setProfile` continua **sem `try/catch` no nível superior**.
- `Routes.appSettings` (`master:103`) e `services/appSettingsCache.ts:22` continuam sem guarda.

A correção sugerida no item 1 deve ser adaptada: em vez de embrulhar as promessas do `Promise.all`,
o mais direto é fazer o `catch` do `timedSetProfile` logar `logger.error({ error, message:
'setProfile.stepFailed', step })` antes do `throw`, e adicionar o `try/catch` externo.

## Divergências da auditoria anterior

Três correções, todas verificadas no código:

1. **`Queries/Users.ts:592` não é um achado.** A auditoria anterior apontou `:592` e `:607` juntos
   como o achado mais grave. Mas `getUserByEmail` (`:195`) retorna sempre `[user]` — um array de um
   elemento — então `!userData.length` nunca é verdadeiro e o branch de `:592` é inalcançável. Mais
   importante: quando o usuário não existe, `getActiveUserByEmail:168` **já emite**
   `logger.warn({ email, message: 'getActiveUserByEmail-userNotFound' })`. Esse caminho está coberto.
   O que sobra de real é só `:607` — usuário existe mas o `roleId` aponta para uma role que não
   existe mais.

2. **`Queries/Users.ts:750` é `:752`.** O `.catch(() => null)` está em `:752`; `:750` é o início
   da expressão.

3. **Quatro achados novos**, nenhum na lista anterior: as chamadas sem guarda em `setProfile`
   (incluindo `services/appSettingsCache.ts`, arquivo que não aparece na auditoria anterior nem
   como achado nem como verificado), as duas escritas fora de `try/catch`, e `checkCustomerSchema`.

## Verificado e considerado adequado

- **`node/directives/helper.ts`** — os 3 catches (`:70`, `:157`, `:210`) logam `warn` + `err`, e os
  branches de token de outra conta (`:42`, `:129`) logam com `account` e `user`.
- **Os quatro directives de acesso** (`checkAdminAccess`, `checkUserAccess`,
  `validateAdminUserAccess`, `validateStoreUserAccess`) — todo caminho de negação loga `warn` com o
  conjunto completo de `metricFields`. Cobertura exemplar.
- **`node/directives/withSession.ts:26`** — o `.catch(() => null)` é deliberado e documentado no
  próprio código: trocado por `SessionMetric` por volume de log.
- **`node/resolvers/Mutations/Users.ts:80,149,177,222`** — tratam um caso conhecido (status < 400) e
  dão `throw error`, caindo nos callers que logam.
- **`node/resolvers/Routes/utils/index.ts`** — `generateClUser` e `getUserOrganizationsData` logam
  em cada ponto de falha, com `email` e `page` como contexto.
- **`node/resolvers/Routes/index.ts` (`checkPermissions` e o resto de `setProfile`)** — 14 caminhos
  de falha, todos logados com contexto suficiente.
- **`node/metrics/session.ts` e `node/metrics/auth.ts`** — falha de envio de métrica é logada.
- **`node/resolvers/Queries/Roles.ts:43`** — o branch 404 é a primeira execução (VBase vazio) e cai
  no fallback do MasterData; logar ali seria ruído.
- **`node/resolvers/Routes/index.ts:249`** — o early return para usuário sem `orgId` é o caminho
  normal de todo shopper B2C.

## Correções sugeridas

### 1. `Routes/index.ts` — `setProfile` sem tratamento de erro no topo

Achado mais grave. Hoje, um timeout de 5s no `b2b-organizations-graphql` faz `setProfile` responder
500 sem que o serviço registre nada — e `setProfile` roda em toda sessão de shopper B2B.

Duas correções complementares. Primeiro, guardar cada promessa do `Promise.all` para que a falha
seja atribuível ao cliente certo:

```typescript
    const settle = <T>(promise: Promise<T>, message: string) =>
      promise.catch((error) => {
        logger.error({ error, message, orgId: user.orgId, costId: user.costId })

        return null
      })

    const [
      organizationResponse,
      costCenterResponse,
      salesChannels,
      marketingTagsResponse,
      b2bSettingsResponse,
      appSettings,
    ] = await Promise.all([
      getOrganization(user.orgId),
      settle(organizations.getCostCenterById(user.costId), 'setProfile.getCostCenterByIdError'),
      settle(salesChannelClient.getSalesChannel(), 'setProfile.getSalesChannelError'),
      settle(organizations.getMarketingTags(user.costId), 'setProfile.getMarketingTagsError'),
      settle(organizations.getB2BSettings(), 'setProfile.getB2BSettingsError'),
      settle(getCachedAppSettings(ctx), 'setProfile.getAppSettingsError'),
    ])
```

Isso exige checar `null` nos consumidores — hoje `:329` já quebra com `organization.status` quando
`getOrganization` cai no `.catch` e retorna `undefined`, então esse endurecimento é necessário de
qualquer forma.

Segundo, um `try/catch` externo em `setProfile` como rede de segurança, para que nenhuma exceção
inesperada saia sem log:

```typescript
  setProfile: async (ctx: Context) => {
    const {
      vtex: { logger },
    } = ctx

    try {
      // corpo atual
    } catch (error) {
      logger.error({ error, message: 'setProfile.unhandledError' })
      throw error
    }
  },
```

O mesmo vale para `Routes.appSettings` (`:21`), chamado em `:426` sem guarda.

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
`setActiveUserByOrganization:599`), passar `logger` e logar antes do
`throw new Error('User not found')` — hoje esse throw sai sem registro algum.

### 3. `Queries/Users.ts:607` — role órfã derruba permissões em silêncio

```typescript
  if (!userRole) {
    logger.warn({
      email,
      message: 'getRoleAndPermissionsByEmail-roleNotFound-degraded',
      roleId: userData[0].roleId,
    })

    return defaultResponse
  }
```

Vale notar que `getRole` (`Queries/Roles.ts:63`) retorna `{ status: 'error', message }` em caso de
falha — um objeto **truthy**. Ou seja, o `!userRole` acima não pega o caso de erro; ele cai adiante
com `features` `undefined` e devolve permissões vazias. A falha em si já é logada em `Roles.ts:77`,
mas o ideal é `getRole` devolver `null` no catch para que os dois casos convirjam neste branch.

### 4. `Queries/Users.ts:752` — impersonation

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

### 5. `Mutations/Users.ts:605` e `Queries/Settings.ts:76` — escritas sem guarda

Mover `updateUserFields` para dentro do `try` que já existe logo abaixo (`:613`) resolve o primeiro
caso. Para o `vbase.saveJSON` de `getAppSettings`, um `.catch` que loga e segue evita que o setup do
app falhe inteiro por causa da persistência do hash de schema.

### 6. `directives/withUserPermissions.ts:24`

Replicar o que `withSession.ts` já faz: destruturar `logger` de `context.clients` e emitir
`SessionMetric` após o `.catch(() => null)`, para que os dois directives tenham a mesma visibilidade
sobre sessão ausente.

### 7. `Queries/Settings.ts:79`

```typescript
  const roles: any = await syncRoles(ctx).catch((error) => {
    logger.error({
      error,
      message: 'getAppSettings.syncRolesError',
    })

    return []
  })
```

### 8. `Queries/Users.ts:246` — `checkCustomerSchema`

Query exposta que hoje responde `{ status: 'error' }` sem log:

```typescript
  const latestSchema = await schema
    .getLatestSchema(CUSTOMER_SCHEMA_NAME)
    .catch((error: any) => {
      logger.error({
        error,
        message: 'checkCustomerSchema.getLatestSchemaError',
        schemaName: CUSTOMER_SCHEMA_NAME,
      })

      return null
    })

  if (!latestSchema) {
    logger.warn({
      message: 'checkCustomerSchema-schemaNotFound',
      schemaName: CUSTOMER_SCHEMA_NAME,
    })

    return { status: 'error', message: 'Schema not found' }
  }
```

### 9. `Queries/Roles.ts:59`

Trocar `throw new Error(error)` por `throw error` preserva stack e response, e faz o `logger.error`
de `getRole` gravar o erro real. O mesmo padrão aparece em `Users.ts:127,807,877,932` e
`Settings.ts:72`, mas nesses casos o log já aconteceu antes do rethrow, então só o de `Roles.ts`
degrada o registro.

### 10. `utils/metrics/changeTeam.ts:54`

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

### 11, 12 e 13

Baixa prioridade. O item 11 (leituras de settings no VBase) tem impacto pequeno; os itens 12
(`LicenseManager`) e 13 (`changeToAnonymousUser`) são código sem chamador — vale revisitar se e
quando esses métodos voltarem a ser usados.

## Metodologia

Pré-scan por regex (`entry points`, `catch`, chamadas de log e nível detectado) sobre os 45 arquivos
`.ts` de `node/` que não são só de tipo, seguido de leitura do contexto em torno de cada ponto
sinalizado. Grep de call sites para separar código vivo de código morto. Cada local foi julgado em
uma de três categorias:

- **missing** — nenhuma chamada de log no caminho de falha.
- **insufficient** — existe log, mas sem objeto de erro, sem identificador, ou em um canal que não
  chega ao índice estruturado.
- **covered** — log com contexto real em qualquer nível razoável. `warn` em falha esperada e tratada
  conta como coberto tanto quanto `error`.
