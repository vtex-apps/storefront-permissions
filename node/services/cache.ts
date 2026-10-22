import { LRUCache } from '@vtex/api'

import { VBASE_CACHE_BUCKET } from '../utils/constants'
import {
  deleteFromVBase,
  saveToVBase,
  staleFromVBaseWhileRevalidate,
} from '../utils/staleFromVBaseWhileRevalidate'

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
  /**
   * Default true. False disables the stale-while-revalidate behavior of the
   * VBase layer: an expired entry is refetched before answering.
   */
  vbaseServeStale?: boolean
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

  const memoryKeyFor = (ctx: Context, key: string) =>
    `${ctx.vtex.account}-${ctx.vtex.workspace}-${key}`

  /**
   * Drops the entry from this pod's memory and from VBase. Other pods keep
   * their memory copy until it expires, so callers that need correctness must
   * also validate what they read.
   */
  const invalidate = async (ctx: Context, key: string): Promise<void> => {
    const memoryKey = memoryKeyFor(ctx, key)
    const { storage } = cache as any

    if (typeof storage?.del === 'function') {
      storage.del(memoryKey)
    } else {
      cache.set(memoryKey, undefined as any, 1)
    }

    if (options.vbaseTtlMinutes) {
      await deleteFromVBase(
        ctx.clients?.vbase,
        VBASE_CACHE_BUCKET,
        `${name}-${key}`,
        ctx.vtex?.logger
      )
    }
  }

  const read = async (
    ctx: Context,
    key: string,
    fetcher: () => Promise<T>,
    overrides?: {
      memoryTtlMs?: number
      /**
       * Skip both reads (memory and VBase, including a stale VBase entry) and
       * go to the origin, but still store the fresh value in both layers so
       * the requests that follow are served from cache again. For callers
       * that know any entry under this key is suspect for this request.
       */
      bypassRead?: boolean
    }
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
              serveStale: options.vbaseServeStale,
            }
          )
        : fetcher()

    if (memoryTtlMs <= 0) {
      // Explicitly disabled means disabled: bypass the VBase layer too, not
      // just the memory one, otherwise "0" would still serve values up to the
      // VBase TTL old.
      return fetcher()
    }

    const memoryKey = memoryKeyFor(ctx, key)

    if (overrides?.bypassRead) {
      // A rejection propagates without writing anything, exactly like a
      // failed getOrSet: misses and outages are never cached.
      const fresh = await fetcher()

      cache.set(memoryKey, fresh, memoryTtlMs)

      if (options.vbaseTtlMinutes) {
        saveToVBase(
          ctx.clients.vbase,
          VBASE_CACHE_BUCKET,
          `${name}-${key}`,
          fresh,
          {
            expirationInMinutes: options.vbaseTtlMinutes,
            logger: ctx.vtex.logger,
          }
        )
      }

      return fresh
    }

    // getOrSet is typed as `V | void`, so normalize it for callers.
    const cached = await cache.getOrSet(memoryKey, () =>
      readThrough().then((value) => ({
        maxAge: memoryTtlMs,
        value,
      }))
    )

    return cached as unknown as T | undefined
  }

  return Object.assign(read, { invalidate })
}
