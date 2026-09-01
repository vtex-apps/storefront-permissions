import {
  SALES_CHANNEL_CACHE_TTL_IN_MINUTES,
  SALES_CHANNEL_MEMORY_CACHE_TTL_IN_MS,
} from '../utils/constants'
import { createCachedResource } from './cache'

type SalesChannelResult = Record<string, unknown>

/**
 * The sales channel list comes from an uncached private catalog endpoint and is
 * identical for every user of the account, so it does not need to be fetched on
 * every session transform.
 */
const cachedSalesChannel = createCachedResource<SalesChannelResult>(
  'sales-channel',
  {
    maxEntries: 100,
    memoryTtlMs: SALES_CHANNEL_MEMORY_CACHE_TTL_IN_MS,
    vbaseTtlMinutes: SALES_CHANNEL_CACHE_TTL_IN_MINUTES,
  }
)

export const getCachedSalesChannel = async (
  ctx: Context
): Promise<SalesChannelResult> => {
  const {
    clients: { salesChannel },
  } = ctx

  const cached = await cachedSalesChannel(
    ctx,
    'list',
    () =>
      salesChannel.getSalesChannel() as unknown as Promise<SalesChannelResult>
  )

  return cached ?? {}
}
