import { LRUCache } from '@vtex/api'

import { VBASE_CACHE_BUCKET } from '../utils/constants'
import { staleFromVBaseWhileRevalidate } from '../utils/staleFromVBaseWhileRevalidate'

const DEFAULT_MAX_ENTRIES = 1000

/**
 * Every cache created through createCachedResource registers itself here, so
 * hit rates and sizes can be reported periodically. getStats() resets its
 * counters on read, which makes each report cover exactly one interval.
 */
const registeredCaches = new Map<string, LRUCache<string, any>>()

export const collectCacheStats = () =>
  Array.from(registeredCaches.entries()).map(([name, cache]) =>
    cache.getStats(name)
  )

/**
 * Serialized length of a cached value, used as its weight when a cache is
 * bounded by bytes. Only runs when an entry is stored, never on a cache hit.
 */
const approximateSize = (value: unknown): number => {
  try {
    return JSON.stringify(value)?.length || 1
  } catch (error) {
    return 1
  }
}

export interface CachedResourceOptions {
  /** Entries kept in the per-pod LRU. Ignored when `maxSizeBytes` is set. */
  maxEntries?: number
  /**
   * Byte budget for the whole cache, measured as serialized length.
   *
   * Prefer this over `maxEntries` when payload size varies a lot: cost center
   * documents were measured spanning roughly 400B to 29KB, so a fixed entry
   * count makes the memory footprint swing by ~70x. Budgeting bytes means one
   * unusually large document evicts others instead of growing the heap.
   *
   * Note that a parsed object costs more heap than its serialized length, so
   * size the budget with room to spare.
   */
  maxSizeBytes?: number
  /** Per-pod in-memory TTL. Set to 0 to bypass caching entirely. */
  memoryTtlMs: number
  /**
   * When set, adds a cross-pod VBase stale-while-revalidate layer behind the
   * in-memory one.
   *
   * Only worth it when the origin is expensive (Apps API, Master Data, another
   * app's GraphQL). Omit it for resources that already live in VBase, where it
   * would just swap one VBase read for another.
   */
  vbaseTtlMinutes?: number
}

/**
 * Builds a cached view of a resource with up to two layers:
 *
 * 1. Per-pod in-memory LRU, so a warm pod does no I/O at all. This is what makes
 *    the repeated calls within a single storefront navigation cheap.
 * 2. Optional cross-pod VBase stale-while-revalidate. When the in-memory entry
 *    expires the read falls through to here, which returns the stored value
 *    straight away and refreshes in the background, so the expensive origin call
 *    never lands on a request.
 *
 * Keys are scoped per account and workspace to keep tenants isolated. Each
 * resource owns its own LRU, so the resource name is not part of the memory key;
 * it is only needed in the VBase path, where all resources share one bucket.
 */
export const createCachedResource = <T>(
  name: string,
  options: CachedResourceOptions
) => {
  // With a `length` function, lru-cache treats `max` as a total size budget
  // rather than an entry count.
  const cache = new LRUCache<string, T>(
    options.maxSizeBytes
      ? ({
          length: approximateSize,
          max: options.maxSizeBytes,
        } as any)
      : { max: options.maxEntries ?? DEFAULT_MAX_ENTRIES }
  )

  registeredCaches.set(name, cache as LRUCache<string, any>)

  return async (
    ctx: Context,
    key: string,
    fetcher: () => Promise<T>,
    overrides?: { memoryTtlMs?: number }
  ): Promise<T | undefined> => {
    const memoryTtlMs = overrides?.memoryTtlMs ?? options.memoryTtlMs

    const readThrough = () =>
      options.vbaseTtlMinutes
        ? staleFromVBaseWhileRevalidate<T>(
            ctx.clients.vbase,
            VBASE_CACHE_BUCKET,
            `${name}-${key}`,
            fetcher,
            undefined,
            {
              expirationInMinutes: options.vbaseTtlMinutes,
              logger: ctx.vtex.logger,
            }
          )
        : fetcher()

    if (memoryTtlMs <= 0) {
      // Explicitly disabled means disabled: bypass the VBase layer too, not
      // just the memory one, otherwise "0" would still serve values up to the
      // VBase TTL old.
      return fetcher()
    }

    const { account, workspace } = ctx.vtex

    // getOrSet is typed as `V | void`, so normalize it for callers.
    const cached = await cache.getOrSet(`${account}-${workspace}-${key}`, () =>
      readThrough().then((value) => ({
        maxAge: memoryTtlMs,
        value,
      }))
    )

    return cached as unknown as T | undefined
  }
}
