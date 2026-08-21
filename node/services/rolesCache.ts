import { ROLES_CACHE_TTL_IN_MS } from '../utils/constants'
import { createCachedResource } from './cache'

/**
 * Roles are account-level, change only through the admin, and are read on every
 * permission check. The source is VBase (with a Master Data fallback), so an
 * in-memory layer is the only one that helps here.
 *
 * The TTL is kept to one minute because this is authorization data: saveRole /
 * deleteRole write VBase but cannot invalidate the memory layer on other pods,
 * so the TTL bounds how long a revoked permission can remain effective.
 */
const cachedRoles = createCachedResource<any[]>('roles', {
  maxEntries: 100,
  memoryTtlMs: ROLES_CACHE_TTL_IN_MS,
})

export const getCachedRoles = async (
  ctx: Context,
  fetcher: () => Promise<any[]>
): Promise<any[]> => {
  const cached = await cachedRoles(ctx, 'all', fetcher)

  return cached ?? []
}
