# Observability

All telemetry goes through `ctx.vtex.logger`, which ships to the platform log pipeline (Splunk / OpenSearch), tagged automatically with `account`, `workspace` and `app@version`. The design goal: **silent when healthy, loud exactly when something is slow or broken** — this route runs on every session transform across ~1k accounts, so one log line per request is not viable.

## Signals

| Signal | Level | When | What it tells you |
|---|---|---|---|
| `setProfile.timings` | `warn` | Request slower than the threshold (default 1000ms), **or any request that throws** (`failed: true`) | Per-step durations of every external call, plus `slowestStep`, `totalMs`, `orgId`, `costId`, `hashChanged`. Names the degrading dependency without redeploying anything. |
| `setProfile.timings` | `info` | Random sample of healthy requests (`sessionTimingsSampleRate`, default 0 = off) | Baseline p50/p95 material for dashboards. |
| `cacheStats` | `info` | Once per pod every 5 minutes, piggybacked on the transform route | Hit rate, item count and size per cache — the data for tuning cache bounds. |
| `staleFromVBase.revalidateError` | `error` | Background stale-while-revalidate refresh failed | **Important:** the stale value keeps being served, so nothing else surfaces a dead origin. |
| `staleFromVBase.saveError` | `error` | Cross-pod cache write failed | Pods quietly stop warming each other; origin traffic creeps back up. |
| `staleFromVBase.readError` | `warn` | VBase read failed (request fell back to origin) | Recoverable per request, but a VBase outage shows up here. |
| `setProfile.salesChannelDeferredToBinding` | `info` | Per request when the sales-channel deferral is active | If these *disappear* on an account that should have the flag on, the setting was lost (e.g. after a major version bump). |
| `setProfile.regionDeferredToCheckoutSession` | `info` | Per request when the region handoff is active | Same reasoning as above. |
| `setProfile.*Error` (updateSalesChannel, marketing data, shipping, CL profile, B2B settings...) | `error` | A fire-and-forget cart update failed | These never fail the response, so this is their only trace. |
| `setProfile.body` / `setProfile.output` | `info` | Only when `logSessionPayloads` is enabled | Full session payload in/out. **Contains PII** (shopper email, organization data) and costs two `JSON.stringify` per request — enable per account only during an active investigation, then turn it off. |

## App settings (all tunable per account, no release needed)

| Setting | Default | Purpose |
|---|---|---|
| `sessionTimingsSlowThresholdMs` | 1000 | Slow-request threshold for the `warn` timing log |
| `sessionTimingsSampleRate` | 0 | Fraction (0–1) of healthy requests logging timings as `info` |
| `logSessionPayloads` | false | Full payload logging (see PII warning above) |
| `sessionUserCacheTtlMs` | 300000 | Active-user cache TTL; 0 disables |

Settings propagate within ~10 minutes (memory + VBase cache TTLs).

## Debugging an incident

1. **Find the slow/failing requests:** query `setProfile.timings` for the account. `failed: true` entries are transforms that threw; the rest exceeded the threshold. `slowestStep` names the culprit directly — e.g. `getCostCenterById` degrading means `vtex.b2b-organizations` is the problem, not this app.
2. **Need a baseline?** Set `sessionTimingsSampleRate: 0.01` on the affected account. 1% of healthy traffic starts logging timings; compare distributions before/after.
3. **Suspect stale data?** Check `staleFromVBase.revalidateError` — a failing origin behind a warm cache is invisible everywhere else. `cacheStats` shows whether hit rates collapsed (e.g. after a pod scale-up storm).
4. **Need the exact payload?** Enable `logSessionPayloads` on that account, reproduce, disable. Do not leave it on.
5. A hung request never shows as `failed`: Session Manager abandons the transform at 2s while the handler finishes and logs as *slow*. Exceptions show as `failed: true` with the steps completed before death.

## Suggested alerts (configure in OpenSearch)

- **Failure rate:** count of `setProfile.timings` with `failed: true`, grouped by account — anything sustained is an incident (this signal caught a production 500 in the inactive-organization path).
- **Slow-rate step change:** volume of `warn` timings per account vs its trailing baseline.
- **Silent origin failure:** any `staleFromVBase.revalidateError` sustained for more than a few minutes.
- **Lost feature flag:** `salesChannelDeferredToBinding` (or `regionDeferredToCheckoutSession`) log volume dropping to zero on an account where the flag should be on — the signature of settings lost on a major version bump.

## What deliberately does NOT log

Healthy requests. Per-call log lines were considered and rejected: at this volume they cost more than the calls they measure. The timer accumulates in memory (~20 `Date.now()` calls and one small object per request) and emits a single gated line. Platform-level request logs (status codes, unhandled errors) come from VTEX IO's router for free and are not duplicated here.
