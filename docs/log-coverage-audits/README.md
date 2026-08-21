# Auditorias de cobertura de logs

Histórico das auditorias de cobertura de logs do `storefront-permissions`. Cada auditoria mapeia os
caminhos de erro do serviço e aponta onde uma falha de produção passaria despercebida por não gerar
nenhum log — ou por gerar um log sem contexto suficiente para debug.

## Histórico

| Data | Escopo | Commit | Score | Relatório |
|---|---|---|---|---|
| 2026-08-21 | `node/` | `c3c6dbe` | 87/104 ≈ 84% | [2026-08-21-log-coverage-audit-c3c6dbe.md](./2026-08-21-log-coverage-audit-c3c6dbe.md) — commit posterior ao das duas primeiras; `Routes/index.ts` e `Queries/Users.ts` mudaram no meio |
| 2026-08-21 | `node/` | `508bff6` | 86/112 ≈ 77% | [2026-08-21-log-coverage-audit-review.md](./2026-08-21-log-coverage-audit-review.md) — revisão independente do mesmo commit |
| 2026-08-21 | `node/` | `508bff6` | 85/95 ≈ 89% | [2026-08-21-log-coverage-audit.md](./2026-08-21-log-coverage-audit.md) |

## Convenções

- Um arquivo por auditoria, nomeado `YYYY-MM-DD-log-coverage-audit.md`. Quando houver mais de uma
  auditoria no mesmo dia, sufixar com o commit auditado (`-<short-sha>.md`) para desambiguar.
- Registrar sempre o commit auditado, para que o score seja reproduzível e os números de linha
  façam sentido depois.
- Além dos achados, manter a seção "Verificado e considerado adequado". Ela evita que decisões
  deliberadas — como trocar log por métrica em caminho de alto volume — sejam reabertas na próxima
  auditoria.
- O score é `covered / (covered + missing + insufficient)` sobre os caminhos de erro e decisão
  julgados. Caminhos triviais e sem efeito colateral ficam fora do denominador.
- Scores só são comparáveis entre auditorias que contam o denominador da mesma forma. Registrar no
  relatório qual é a unidade contada (bloco de `catch` vs. local que precisa de log).
