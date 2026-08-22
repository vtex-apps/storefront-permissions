# Observability

All telemetry goes through `ctx.vtex.logger`, which ships to the platform log pipeline, tagged automatically with `account`, `workspace` and `app@version`. The design goal: **silent when healthy, loud exactly when something is slow or broken** — this route runs on every session transform of every account with the B2B Suite installed, so one log line per request is not viable.

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
| `setProfile.cartAddressSanitized` (`code: CART_ADDRESS_SANITIZED`) | `warn` | The cost center address carried characters checkout rejects (`< > ? + " ; %`) in `reference` or `complement`, and they were stripped before sending | Counts how often the `CHK0040` rejection is being prevented. Only these two fields are ever rewritten: they describe *how* to deliver, never *where*, so stripping cannot move the delivery. Reports which fields were rewritten, which characters came out, and `orgId` / `costId` / `costCenterAddressId` to find the record. **Never reports address values**, at any level or setting. |
| `setProfile.cartAddressFieldRejected` (`code: CART_ADDRESS_FIELD_REJECTED`) | `error` | The cost center address has forbidden characters in a **location-bearing** field (`street`, `number`, `city`, `state`, `neighborhood`, `receiverName`, `postalCode`, `country`) | These are never rewritten: the characters can be legitimate there (Plus Codes are built around `+`; B2B receiver names carry `"` as an inch mark), so stripping one may point the delivery somewhere else — a corrupted location is worse than a rejected one. Checkout rejects the attachment and the cart keeps its previous address, so **the record has to be fixed at the source**. |
| `setProfile.updateOrderFormShippingError` (`code: CART_ADDRESS_UPDATE_FAILED`) | `error` | The cart address update failed even after sanitizing | Carries checkout's own `vtexErrorCode`, the HTTP `status`, and the fields that were rewritten. Compare its rate against `CART_ADDRESS_SANITIZED` to see what the sanitization did and did not fix. **The cart keeps its previous address**, so the shopper may be shipping to the wrong place. |
| `setProfile.unknownOrganizationStatus`, `getUserOrganizationsData.unknownOrganizationStatus` | `warn` | An organization status this app does not recognize | `b2b-organizations` owns the status vocabulary and this app mirrors it (see [Performance and caching](PERFORMANCE_AND_CACHING.md)); these fire when a new value is introduced upstream. Unknown statuses fail closed, so this is the signal that the two copies of the rule have diverged. |
| `setProfile.organizationRecovered` | `warn` | The shopper's stored selection points at an unusable organization and the session was served with another one | Nothing is written to resolve it — which record is active belongs to the shopper or the account admin — so every session for this shopper re-enters the recovery until one of them acts. Carries the unusable and the recovered organization ids; a sustained stream for one shopper means their record needs attention at the source. |
| `setProfile.organizationUnavailable` | `error` | The shopper's organization is missing or not active and nothing could be recovered | The transform fails, and Session Manager reports only a generic "App storefront-permissions failed" 502 — so this log is the only place that names the shopper, the organization and the `reason`/`status`. |
| `getActiveUserByEmail-noActiveRecord` | `warn` | The shopper has records but none is active (first login, or the selection was lost) | The resolution fell back read-only; reports the record and organization it used. |
| `getActiveUserByEmail-stickyOrgNoLongerAvailable`, `-stickyCostCenterNoLongerAvailable` | `warn` | The organization/cost center the session was pinned to is gone | Expected after an admin removes someone from an organization; a spike means something is deleting records. |
| `setProfile.*Error` (updateSalesChannel, marketing data, shipping, CL profile, B2B settings...) | `error` | A fire-and-forget cart update failed | These never fail the response, so this is their only trace. |
| `setProfile.body` / `setProfile.output` | `info` | Only when `logSessionPayloads` is enabled | Full session payload in/out. **Contains PII** (shopper email, organization data) and costs two `JSON.stringify` per request — enable per account only during an active investigation, then turn it off. |

## Counting vs debugging: two channels

The platform log pipeline **samples** app logs deterministically (1 in 20 at the time of writing), and it does not spare the `error` level. Two consequences:

- Any count built from log volume is an **estimate** (multiply by the sampling factor), and a rare event can be dropped entirely.
- The app cannot opt a log line out of that sampling.

Signals that must be **counted**, not estimated, are therefore shipped twice:

1. The **log line** (sampled) — the debugging surface, carries shopper context.
2. An **analytics event** via `sendObservabilityEvent` (`kind: b2b-storefront-permissions-<name>`) — the measuring surface, exact counts, same channel as the app's auth audit events. Stricter privacy contract than the logs: identifiers only, never emails, names or addresses.

Currently double-shipped: `organization-recovered`, `organization-unavailable`, `cart-address-sanitized`, `cart-address-field-rejected`, `cart-address-update-failed`. Events are fire-and-forget; a delivery failure is logged as `observabilityEvent.sendError` and never affects the request.

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

- **Failure rate:** count of `setProfile.timings` with `failed: true`, grouped by account — anything sustained is an incident. This is the most valuable single alert: the transform's failures reach the shopper as a generic Session Manager 502 that names no cause.
- **Slow-rate step change:** volume of `warn` timings per account vs its trailing baseline.
- **Silent origin failure:** any `staleFromVBase.revalidateError` sustained for more than a few minutes.
- **Lost feature flag:** `salesChannelDeferredToBinding` (or `regionDeferredToCheckoutSession`) log volume dropping to zero on an account where the flag should be on — the signature of settings lost on a major version bump.

## What deliberately does NOT log

**Healthy requests.** Per-call log lines were considered and rejected: at this volume they cost more than the calls they measure. The timer accumulates in memory (~20 `Date.now()` calls and one small object per request) and emits a single gated line. Platform-level request logs (status codes, unhandled errors) come from VTEX IO's router for free and are not duplicated here.

**Raw client errors — anywhere.** The HTTP client attaches the request to the error it throws: `config.data` is the request body (addresses, profile data) and `config.url` can carry emails in its query string (Master Data `_where` clauses). Passing `error` straight to the logger would carry all of that into the log pipeline. So **every** error log in this app goes through `describeClientError` (`node/utils/clientError.ts`), which keeps what debugging needs and drops the rest:

- `message`, `code`, `status` — what failed and how (email-redacted).
- `vtexErrorCode` / `vtexErrorMessage` — the VTEX backend's own error contract.
- `operationId`, `requestId`, `backend` — the correlation ids VTEX backends answer with (`x-vtex-operation-id`, `x-request-id`, `x-vtex-janus-router-backend-app`, verified against live responses). Hand these to the owning team and they can locate the exact request on their side.
- `method` and `path` — with the query string stripped.
- `stack` — first lines only; code locations, never data.

Rule for new code: a `.catch` never logs its error directly — always `error: describeClientError(error)`. There is a test asserting the described object carries no request body, no query string and no unredacted email.

**Addresses, additionally.** The address sanitizer returns only the field name and the characters it removed, so a caller cannot log an address value by accident.
