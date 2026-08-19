/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  REGION_CACHE_TTL_IN_MINUTES,
  REGION_CACHE_TTL_IN_MS,
} from '../utils/constants'
import { createCachedResource } from './cache'

const cachedRegion = createCachedResource<any>('region', {
  // Small payloads, keyed by locality rather than by user, so many shoppers share
  // one entry.
  maxEntries: 10000,
  memoryTtlMs: REGION_CACHE_TTL_IN_MS,
  vbaseTtlMinutes: REGION_CACHE_TTL_IN_MINUTES,
})

export interface RegionCacheKey {
  country: string
  geoCoordinates: [number, number] | null
  postalCode: string | null
  salesChannel: string
}

/**
 * checkout's region lookup depends only on its four inputs, so the whole tuple is
 * the cache key. Cost centers in the same city and sales channel therefore share
 * one entry instead of each paying the round-trip on every session transform.
 */
export const getCachedRegionId = async (
  ctx: Context,
  key: RegionCacheKey,
  fetcher: () => Promise<any>
): Promise<any> => {
  const { country, geoCoordinates, postalCode, salesChannel } = key

  const cacheKey = [
    country,
    postalCode ?? '',
    salesChannel,
    geoCoordinates ? geoCoordinates.join(';') : '',
  ].join('|')

  return cachedRegion(ctx, cacheKey, fetcher)
}
