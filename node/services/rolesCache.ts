import { ROLES_CACHE_TTL_IN_MS } from '../utils/constants'
import { createCachedResource } from './cache'

/**
 * Roles are account-level, change only through the admin, and are read on every
 * permission check. The source is VBase (with a Master Data fallback), so an
 * in-memory layer is the only one that helps here.
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
