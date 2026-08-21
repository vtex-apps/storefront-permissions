# Log coverage — PR #206

**Date:** 2026-08-21  
**Scope:** `node/**/*.ts`  
**Score:** 68/93 = 73.1% (missing 25, insufficient 0)

Deterministic proxy metric over `try/catch` and `.catch(...)` handlers. It is not a model-judged audit score, which also weighs validation aborts and cross-function context. Judged audits: [`2026-08-21-log-coverage-audit-review.md`](../../../log-coverage-audits/2026-08-21-log-coverage-audit-review.md), [`2026-08-21-log-coverage-audit-c3c6dbe.md`](../../../log-coverage-audits/2026-08-21-log-coverage-audit-c3c6dbe.md), [`2026-08-21-log-coverage-audit.md`](../../../log-coverage-audits/2026-08-21-log-coverage-audit.md). See [`docs/log-coverage/README.md`](../../README.md).

## Delta

- **Baseline** (none): 0/0 = 0.0% (missing 0, insufficient 0)
- **This branch**: 68/93 = 73.1% (missing 25, insufficient 0)
- **Delta**: up 73.1 pp

### New or regressed (25)

| file:line | kind | status | body |
|---|---|---|---|
| `node/clients/checkout.ts:270` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:328` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:339` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:354` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:363` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:380` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:391` | promise-catch | **missing** | `statusToError` |
| `node/directives/withSession.ts:26` | promise-catch | **missing** | `() => null` |
| `node/directives/withUserPermissions.ts:24` | promise-catch | **missing** | `() => null` |
| `node/resolvers/Mutations/Settings.ts:12` | promise-catch | **missing** | `() => { return {} }` |
| `node/resolvers/Mutations/Users.ts:135` | promise-catch | **missing** | `() => null` |
| `node/resolvers/Queries/Settings.ts:21` | promise-catch | **missing** | `() => { return {} }` |
| `node/resolvers/Queries/Settings.ts:79` | promise-catch | **missing** | `() => []` |
| `node/resolvers/Queries/Settings.ts:94` | promise-catch | **missing** | `() => { return {} }` |
| `node/resolvers/Queries/Users.ts:789` | promise-catch | **missing** | `() => null` |
| `node/utils/LicenseManager.ts:29` | promise-catch | **missing** | `() => { return null }` |
| `node/utils/LicenseManager.ts:50` | promise-catch | **missing** | `() => { return {} }` |
| `node/utils/LicenseManager.ts:58` | promise-catch | **missing** | `() => false` |
| `node/utils/LicenseManager.ts:74` | promise-catch | **missing** | `() => { return false }` |
| `node/utils/LicenseManager.ts:119` | catch-block | **missing** | `return false` |
| `node/utils/LicenseManager.ts:137` | catch-block | **missing** | `return false` |
| `node/utils/LicenseManager.ts:143` | promise-catch | **missing** | `statusToError` |
| `node/utils/LicenseManager.ts:147` | promise-catch | **missing** | `statusToError` |
| `node/utils/LicenseManager.ts:151` | promise-catch | **missing** | `statusToError` |
| `node/utils/LicenseManager.ts:155` | promise-catch | **missing** | `statusToError` |

### Resolved or removed (0)

_none_

## All open findings (25)

| file:line | kind | status | body |
|---|---|---|---|
| `node/clients/checkout.ts:270` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:328` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:339` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:354` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:363` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:380` | promise-catch | **missing** | `statusToError` |
| `node/clients/checkout.ts:391` | promise-catch | **missing** | `statusToError` |
| `node/directives/withSession.ts:26` | promise-catch | **missing** | `() => null` |
| `node/directives/withUserPermissions.ts:24` | promise-catch | **missing** | `() => null` |
| `node/resolvers/Mutations/Settings.ts:12` | promise-catch | **missing** | `() => { return {} }` |
| `node/resolvers/Mutations/Users.ts:135` | promise-catch | **missing** | `() => null` |
| `node/resolvers/Queries/Settings.ts:21` | promise-catch | **missing** | `() => { return {} }` |
| `node/resolvers/Queries/Settings.ts:79` | promise-catch | **missing** | `() => []` |
| `node/resolvers/Queries/Settings.ts:94` | promise-catch | **missing** | `() => { return {} }` |
| `node/resolvers/Queries/Users.ts:789` | promise-catch | **missing** | `() => null` |
| `node/utils/LicenseManager.ts:29` | promise-catch | **missing** | `() => { return null }` |
| `node/utils/LicenseManager.ts:50` | promise-catch | **missing** | `() => { return {} }` |
| `node/utils/LicenseManager.ts:58` | promise-catch | **missing** | `() => false` |
| `node/utils/LicenseManager.ts:74` | promise-catch | **missing** | `() => { return false }` |
| `node/utils/LicenseManager.ts:119` | catch-block | **missing** | `return false` |
| `node/utils/LicenseManager.ts:137` | catch-block | **missing** | `return false` |
| `node/utils/LicenseManager.ts:143` | promise-catch | **missing** | `statusToError` |
| `node/utils/LicenseManager.ts:147` | promise-catch | **missing** | `statusToError` |
| `node/utils/LicenseManager.ts:151` | promise-catch | **missing** | `statusToError` |
| `node/utils/LicenseManager.ts:155` | promise-catch | **missing** | `statusToError` |
