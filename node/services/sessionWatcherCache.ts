import { getSessionWatcher } from '../resolvers/Queries/Settings'
import { SESSION_WATCHER_CACHE_TTL_IN_MS } from '../utils/constants'
import { createCachedResource } from './cache'

/**
 * `getSessionWatcher` reads its flag straight from VBase on every single session
 * transform, which measured as the most expensive step once the other calls were
 * cached. A VBase-backed layer would not help here (it would just swap one VBase
 * read for another), so this is in-memory only: a warm pod does no I/O and a cold
 * pod pays a single read.
 *
 * The TTL is deliberately short: this flag is an operational kill switch, so
 * disabling it must still take effect quickly.
 */
const cachedWatcher = createCachedResource<boolean>('session-watcher', {
  maxEntries: 100,
  memoryTtlMs: SESSION_WATCHER_CACHE_TTL_IN_MS,
})

export const getCachedSessionWatcher = async (
  ctx: Context
): Promise<boolean> => {
  const cached = await cachedWatcher(ctx, 'active', () =>
    Promise.resolve(getSessionWatcher(null, null, ctx)).then(
      // Anything other than an explicit `false` keeps the watcher active,
      // preserving the original default-on behaviour.
      (value) => value !== false
    )
  )

  return cached !== false
}
