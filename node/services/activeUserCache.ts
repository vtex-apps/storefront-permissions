import {
  ACTIVE_USER_CACHE_TTL_IN_MINUTES,
  ACTIVE_USER_CACHE_TTL_IN_MS,
  PERMISSIONS_USER_CACHE_TTL_IN_MS,
} from '../utils/constants'
import { createCachedResource } from './cache'

/**
 * Resolving the active user runs a *paginated* Master Data search, which was
 * measured spiking well past a second, and the session transform runs several
 * times per navigation for the same email.
 *
 * The key is `email + b2bCurrentCostCenter + sticky`. `b2bCurrentCostCenter` is
 * written into the session by `setCurrentOrganization` whenever the user switches
 * organization, so a switch produces a different key and therefore a miss, rather
 * than serving the previous organization from cache. `sticky` is the
 * organization/cost center pair the session already carries, which participates in
 * resolving the user, so two sessions pinned to different pairs must not share an
 * entry. Because invalidation is exact, both layers can be used and the TTL only
 * has to cover changes that bypass those flows.
 */
const cachedActiveUser = createCachedResource<any>('active-user', {
  // Small payloads (~400B), one per shopper.
  maxEntries: 10000,
  memoryTtlMs: ACTIVE_USER_CACHE_TTL_IN_MS,
  vbaseTtlMinutes: ACTIVE_USER_CACHE_TTL_IN_MINUTES,
})

/**
 * Per tenant: a pod serves multiple accounts/workspaces, so a single global
 * value would let whichever account most recently read its settings dictate
 * the TTL for every other tenant on the pod.
 */
const configuredTtlMsByTenant = new Map<string, number>()

const tenantKey = (ctx: Context) => `${ctx.vtex.account}-${ctx.vtex.workspace}`

/**
 * The TTL is configurable, but this lookup happens before app settings are
 * resolved (awaiting them first would put them back on the critical path). So
 * the configured value is recorded once a request has read the settings and
 * applies from the next request onwards, which is fine for a TTL knob.
 */
export const setActiveUserCacheTtl = (ctx: Context, ttlMs?: unknown) => {
  if (typeof ttlMs === 'number' && ttlMs >= 0) {
    configuredTtlMsByTenant.set(tenantKey(ctx), ttlMs)
  } else {
    // Setting removed: fall back to the default rather than retaining a stale
    // configured value.
    configuredTtlMsByTenant.delete(tenantKey(ctx))
  }
}

export const getCachedActiveUserByEmail = async (
  ctx: Context,
  email: string,
  currentCostCenter: string | null,
  sticky: string | null,
  fetcher: () => Promise<any>
): Promise<any> =>
  cachedActiveUser(
    ctx,
    `${email}|${currentCostCenter ?? 'default'}|${sticky ?? 'none'}`,
    fetcher,
    {
      memoryTtlMs:
        configuredTtlMsByTenant.get(tenantKey(ctx)) ??
        ACTIVE_USER_CACHE_TTL_IN_MS,
    }
  )

/**
 * Variant for permission checks (checkPermissions route). Those requests carry
 * only app + email, so there is no session cost center to key on and an
 * organization switch cannot invalidate by key. Memory-only with a short TTL,
 * so stale permissions are bounded to that window and never extended by a
 * cross-pod layer.
 */
const cachedPermissionsUser = createCachedResource<any>(
  'active-user-permissions',
  {
    maxEntries: 10000,
    memoryTtlMs: PERMISSIONS_USER_CACHE_TTL_IN_MS,
  }
)

export const getCachedActiveUserForPermissions = async (
  ctx: Context,
  email: string,
  fetcher: () => Promise<any>
): Promise<any> => cachedPermissionsUser(ctx, email, fetcher)
