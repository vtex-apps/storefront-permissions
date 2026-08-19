/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  B2B_SETTINGS_CACHE_TTL_IN_MINUTES,
  B2B_SETTINGS_CACHE_TTL_IN_MS,
  COST_CENTER_CACHE_MAX_SIZE_BYTES,
  ORGANIZATION_CACHE_TTL_IN_MINUTES,
  ORGANIZATION_CACHE_TTL_IN_MS,
} from '../utils/constants'
import { createCachedResource } from './cache'

/**
 * These are all cross-app calls into vtex.b2b-organizations / Master Data. Once
 * the account-level lookups were cached they became the most expensive remaining
 * steps of the session transform (getCostCenterById alone measured around a
 * second), and the transform runs several times per navigation.
 *
 * Both layers are used: warm pods do no I/O, and cold pods read the entry a
 * sibling pod already populated instead of paying the cross-app cost.
 */
const cachedB2BSettings = createCachedResource<any>('b2b-settings', {
  maxEntries: 100,
  memoryTtlMs: B2B_SETTINGS_CACHE_TTL_IN_MS,
  vbaseTtlMinutes: B2B_SETTINGS_CACHE_TTL_IN_MINUTES,
})

// Organization documents are small and tightly clustered, so a count is a
// predictable bound here.
const cachedOrganization = createCachedResource<any>('organization', {
  maxEntries: 10000,
  memoryTtlMs: ORGANIZATION_CACHE_TTL_IN_MS,
  vbaseTtlMinutes: ORGANIZATION_CACHE_TTL_IN_MINUTES,
})

// Cost centers carry their addresses, so a single document can be far larger
// than the rest. Bounded by bytes so the footprint cannot swing with the data.
const cachedCostCenter = createCachedResource<any>('cost-center', {
  maxSizeBytes: COST_CENTER_CACHE_MAX_SIZE_BYTES,
  memoryTtlMs: ORGANIZATION_CACHE_TTL_IN_MS,
  vbaseTtlMinutes: ORGANIZATION_CACHE_TTL_IN_MINUTES,
})

export const getCachedB2BSettings = async (
  ctx: Context,
  fetcher: () => Promise<any>
): Promise<any> => cachedB2BSettings(ctx, 'settings', fetcher)

export const getCachedOrganization = async (
  ctx: Context,
  orgId: string,
  fetcher: () => Promise<any>
): Promise<any> => cachedOrganization(ctx, orgId, fetcher)

export const getCachedCostCenter = async (
  ctx: Context,
  costId: string,
  fetcher: () => Promise<any>
): Promise<any> => cachedCostCenter(ctx, costId, fetcher)
