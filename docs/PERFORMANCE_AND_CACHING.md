# Performance and caching in the session transform

`setProfile` (the `vtex.session` transform) runs on **every session creation and update, several times per storefront navigation, across every account with the B2B Suite installed**. Session Manager gives the transform a hard **2-second budget**; historically the transform chained enough serial external calls that cold pods regularly blew it. This document explains how the transform is structured today, how the caching works, and the rules to follow when changing it — so a future change does not silently reintroduce a regression.

## Request flow

The transform is ordered around one principle: **only await what the response actually needs, as late as possible, with everything independent already in flight.**

1. `getSessionWatcher` (cached, memory-only) — the kill switch. If off, return the empty response.
2. Parse body, resolve email; anonymous sessions return before any other call is made.
3. Kick off (not awaited yet): sales channel list, B2B settings, app settings.
4. `getActiveUserByEmail` (cached) — everything else depends on `orgId`/`costId`.
5. Awaited in parallel: `getOrganization` + `getCostCenterById` (the only two calls that need the user).
6. Await the step-3 promises — by now their latency is hidden behind steps 4–5.
7. Sales channel / region / facets logic; region lookup cached or handed off (see [Region resolution](REGION_RESOLUTION.md)).
8. Fire-and-forget cart updates (`promises` array): marketing data, shipping address, CL profile. **These must never be awaited** — they are why `getMarketingTags` and `generateClUser` are not on the critical path.

### Rules when touching this flow

- A new external call must justify its position: does the **response** need its result? If it only feeds a cart update or another side effect, chain it into `promises` instead of awaiting it.
- Every fire-and-forget promise must carry a `.catch` that logs through `ctx.vtex.logger` with a distinct `setProfile.*` message. A promise that can reject unawaited without a catch crashes the worker (unhandled rejection).
- Closures pushed into `promises` must not capture reassigned `let` variables (`user`, `businessName`, ...). Read them into `const`s first — the platform builder compiles stricter than local `tsc` and flags these as implicit `any`.

## Caching architecture

All caches are built by `createCachedResource` (`node/services/cache.ts`), with up to two layers:

1. **Per-pod in-memory LRU** — a warm pod does zero I/O. This is what makes the repeated transforms within one navigation cheap.
2. **Cross-pod VBase stale-while-revalidate** (`node/utils/staleFromVBaseWhileRevalidate.ts`) — on a memory miss, the pod reads the entry a sibling pod populated instead of calling the origin. Stale entries are returned immediately and refreshed in the background, so the origin call never lands on a request after first population.

**Rule: only add the VBase layer when the origin is expensive** (Apps API, Master Data, another app's GraphQL, checkout). For data that already lives in VBase — the session watcher flag, roles — a VBase-backed cache would just swap one VBase read for another; those caches are memory-only.

### Current resources

| Resource | Origin | Layers | Memory TTL | VBase TTL | Bound | Key |
|---|---|---|---|---|---|---|
| `app-settings` | Apps API | both | 5min | 5min | 50 entries | appId |
| `sales-channel` | catalog `pvt` REST | both | 5min | 6h | 100 | `list` |
| `b2b-settings` | b2b-organizations GraphQL | both | 5min | 5min | 100 | `settings` |
| `organization` | Master Data | both | 60s | 2min | 10000 | orgId |
| `cost-center` | b2b-organizations GraphQL | both | 60s | 2min | **8MB byte budget** | costId |
| `active-user` | Master Data (paginated) | both | 5min¹ | 5min | 10000 | `email\|b2bCurrentCostCenter` |
| `active-user-permissions` | Master Data (paginated) | memory only | 60s | — | 10000 | email |
| `region` | checkout REST | both | 30min | 30min | 10000 | `country\|postalCode\|sc\|geo` |
| `session-watcher` | VBase | memory only | 60s | — | 100 | `active` |
| `roles` | VBase (MD fallback) | memory only | 5min | — | 100 | `all` |

¹ Configurable via the `sessionUserCacheTtlMs` app setting; `0` disables.

### Why the TTLs are what they are

- **Sales channel list (6h):** effectively static account data.
- **App settings (5+5min):** feature flags an operator may flip; worst-case propagation is roughly memory TTL + VBase TTL (~10 minutes), because the memory layer holds its entry for its TTL and then may read a stale VBase entry once before the background refresh lands.
- **Organization / cost center (60s/2min):** deliberately short — `organization.status === 'inactive'` blocks the user (`ForbiddenError`), so deactivating an organization must take effect within minutes.
- **Session watcher (60s):** it is the operational kill switch; disabling it must bite quickly.
- **Active user:** the TTL is only a safety net. The cache key contains the session's `public.b2bCurrentCostCenter`, which `setCurrentOrganization` writes on every organization switch — so a switch changes the key and misses the cache immediately, regardless of TTL. The TTL covers changes that bypass that mutation (an admin editing a user's organizations, the inactive-org fallback).
- **`active-user-permissions` (60s, memory only):** the `checkPermissions` route receives only `app` + `email`, so there is no cost center to key on and no key-based invalidation. Short TTL bounds how long stale permissions can survive an organization switch; no VBase layer so nothing extends that window.

### Why the cost center cache is bounded by bytes

Measured on a real account: organization documents span **187–480 bytes** (tight), while cost center documents span **~400 bytes to 29KB** (~70x, driven by the addresses list). A fixed entry count therefore makes the cost-center cache's memory footprint swing by 70x with the data. With a byte budget, `lru-cache` treats `max` as total serialized size: one unusually large document evicts others — and a document larger than the whole budget is *refused*, never stored. Note a parsed object costs roughly 2–3x its serialized length in heap; size budgets accordingly.

## Multi-tenancy

A pod serves **more than one account** (the service route carries `{account}/{workspace}`), and the LRUs are module-level singletons shared by every request the pod handles. Two consequences:

- **Memory keys must be tenant-scoped.** `createCachedResource` prefixes every key with `${account}-${workspace}` automatically. Never build a cache outside it without doing the same — a missing prefix is a cross-tenant data leak.
- **VBase keys must NOT contain the account.** The VBase client is itself scoped to account + workspace (its path is `/vbase/v2/{account}/{workspace}/...`), so adding the account would be redundant; the app already relies on this for `b2b_roles` and `b2b_settings`.

Entry bounds are **global budgets across all tenants on the pod**, not per account. Hit rates are reported per pod every five minutes (see [Observability](OBSERVABILITY.md), `cacheStats`) — tune bounds from those numbers, not guesses.

## Service sizing (`node/service.json`)

`memory: 1024`, `ttl: 300`, `timeout: 60` — the same profile as `b2b-organizations-graphql` and `b2b-checkout-settings`. Two settings that look tunable but should not be changed casually:

- **`workers: 1` is intentional.** Each worker is a separate Node process with its own LRUs; two workers would duplicate every cache (double memory) and halve the hit rate. Scale with replicas, not workers.
- **`timeout: 60` vs the 2s session budget:** Session Manager stops waiting at 2s, but this service also hosts the admin GraphQL routes (user/role listing, bulk operations) that legitimately need the headroom, so the global timeout stays at the suite standard.

## Known measurements (Aug 2026, kohlerqa)

| Scenario | Before | After |
|---|---|---|
| Warm pod, server-side | ~1240ms | **~50–150ms** |
| Cold pod, warm VBase (scale-up) | ~1870ms | **~950ms** |
| Cold pod, cold VBase (first pod after deploy) | ~1870ms | ~1900ms (pays origin once, then warms VBase for all pods) |

## One platform gotcha worth knowing

Saved app settings are scoped to the app's **major version range** (`vtex.storefront-permissions@3.x`). They persist across minor/patch releases and start **empty** on a new major — every merchant silently reverts to `settingsSchema` defaults until settings are re-applied. Plan a settings re-apply step into any major-version upgrade, and prefer fail-safe defaults (losing the stored value should degrade behavior, not change it).
