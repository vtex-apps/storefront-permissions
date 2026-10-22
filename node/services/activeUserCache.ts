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
//
// INC-6700: a stale entry here is wrong, not merely old (it can name the
// organization a shopper just left), so the VBase layer never serves an expired
// entry while revalidating. The name is versioned so entries written by the
// previous stale-while-revalidate setup are never read.
const cachedActiveUser = createCachedResource<any>('active-user-v2', {
  // Small payloads (~400B), one per shopper.
  maxEntries: 10000,
  memoryTtlMs: ACTIVE_USER_CACHE_TTL_IN_MS,
  vbaseServeStale: false,
  vbaseTtlMinutes: ACTIVE_USER_CACHE_TTL_IN_MINUTES,
})

const activeUserKey = (
  email: string,
  currentCostCenter: string | null,
  sticky: string | null
) => `${email}|${currentCostCenter ?? 'default'}|${sticky ?? 'none'}`

/** The `sticky` part of the key, as setProfile builds it from the session pin. */
export const activeUserStickyKey = (
  stickyOrgId?: string | null,
  stickyCostId?: string | null
): string | null =>
  stickyOrgId && stickyCostId
    ? `${stickyOrgId}:${stickyCostId}`
    : stickyOrgId || null

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
  fetcher: () => Promise<any>,
  /**
   * Skip both cache reads (memory and VBase) but still store the fresh result.
   * Used when what the cache held cannot be trusted for this request (its cost
   * center differs from the one the session asked for).
   */
  bypassRead = false
): Promise<any> =>
  cachedActiveUser(
    ctx,
    activeUserKey(email, currentCostCenter, sticky),
    fetcher,
    {
      bypassRead,
      memoryTtlMs:
        configuredTtlMsByTenant.get(tenantKey(ctx)) ??
        ACTIVE_USER_CACHE_TTL_IN_MS,
    }
  )

/**
 * INC-6700: drops every active-user entry an organization switch can make
 * wrong - each combination of the cost centers and session pins given - from
 * this pod's memory and from VBase.
 *
 * Best effort by nature: other pods keep their in-memory copy until it expires,
 * and a switch made by another major (1.x) never calls this. setProfile
 * therefore also refuses any cached entry whose cost center differs from the
 * session's b2bCurrentCostCenter; that check is the correctness guarantee,
 * this only saves the refetch where it can.
 */
export const invalidateActiveUserKeys = async (
  ctx: Context,
  emails: Array<string | null | undefined>,
  currentCostCenters: Array<string | null | undefined>,
  stickies: Array<string | null | undefined>
): Promise<void> => {
  const keys = new Set<string>()

  for (const email of emails) {
    if (!email) {
      continue
    }

    for (const costCenter of currentCostCenters) {
      for (const sticky of stickies) {
        keys.add(activeUserKey(email, costCenter ?? null, sticky ?? null))
      }
    }
  }

  await Promise.all(
    Array.from(keys).map((key) =>
      cachedActiveUser.invalidate(ctx, key).catch(() => undefined)
    )
  )
}

/**
 * Variant for permission checks (REST checkPermissions and GraphQL
 * checkUserPermission / getUserByEmail). Those requests carry only app + email,
 * so there is no session cost center to key on and an organization switch
 * cannot invalidate by key. Memory-only with a 5-minute TTL, so stale
 * permissions are bounded to that window and never extended by a cross-pod
 * layer. REST and GraphQL share the cache.
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
