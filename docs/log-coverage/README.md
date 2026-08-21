# Gate de cobertura de logs

Este diretório guarda a métrica **determinística** de cobertura de logs do `storefront-permissions`:
o baseline commitado e um relatório por PR. Quem produz esses arquivos é
`scripts/log_coverage/audit.py`, e o workflow `Log coverage` os verifica em cada Pull Request.

## O que a métrica mede

De todos os caminhos de tratamento de falha do escopo auditado — blocos `catch` e callbacks passados
para `.catch(...)` — quantos registram a falha em log. O score é `covered / total`.

Cada handler recebe exatamente uma classificação:

| Status | Significado |
|---|---|
| `covered` | Loga a falha **e** repassa o objeto de erro, ou faz rethrow |
| `insufficient` | Loga, mas sem o objeto de erro — só uma mensagem |
| `missing` | Não loga e não faz rethrow. A falha é silenciosa |

O escopo está em `.log-coverage.json` e hoje cobre `node/**/*.ts`, exceto testes, mocks e typings.

## Esta não é a mesma métrica das auditorias julgadas

As auditorias em [`../log-coverage-audits/`](../log-coverage-audits/) foram feitas por um modelo lendo
o código, e contam também abortos de validação, early returns e contexto que atravessa funções. Esta
métrica não conta nada disso: ela casa estrutura de código com regex e só enxerga `catch` e
`.catch()`.

Ou seja, o número daqui é **de resolução mais baixa de propósito**, em troca de ser reproduzível
byte a byte. Serve para travar CI e acompanhar tendência. Para decidir *o que* corrigir, use a
auditoria julgada. Um score não corrige nem substitui o outro.

## Rodando localmente

```bash
make log-coverage                    # score e achados em aberto
make log-coverage-report PR=123      # escreve o baseline e o relatório do PR 123
make log-coverage-test               # testes do próprio scorer
```

Requer `python3`. O relatório sai em `reports/pr-<número>/` e precisa ser commitado junto com o resto
do PR.

## O que trava o merge e o que não trava

- **Trava:** PR que mexe em arquivo do escopo (ou em `scripts/log_coverage/audit.py`) sem trazer o
  relatório atualizado daquele PR.
- **Trava:** teste do scorer quebrado.
- **Não trava:** o score cair. Uma regressão vira comentário no PR para o revisor decidir, não
  falha de CI. Travar no número convida a burlar o número.
- **Não trava:** PR só de documentação ou configuração — roda, passa, e não exige relatório.

## Suprimindo um caso legítimo

Quando engolir a falha é de fato o comportamento correto, marque no código:

```typescript
try {
  await optionalTelemetry(payload)
} catch {
  // log-coverage-ignore: telemetria é best-effort e não pode afetar a request
}
```

O handler sai do denominador — não entra como `covered`, ou seja, suprimir não infla o score. Sempre
escreva o motivo depois do marcador: supressão sem justificativa é indistinguível de falha silenciosa
que alguém cansou de ver.

## Mudou o escopo?

Mudar `scope` muda o score. Trate como reset de baseline: regenere o baseline no mesmo PR e diga isso
na descrição, senão o próximo PR herda um salto inexplicado.
