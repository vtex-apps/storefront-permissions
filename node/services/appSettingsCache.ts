import { APP_SETTINGS_CACHE_TTL_IN_MINUTES } from '../utils/constants'
import { createCachedResource } from './cache'

const APP_SETTINGS_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000

type AppSettings = Record<string, unknown>

/**
 * App settings (manifest settingsSchema). The Apps API was measured as one of
 * the most expensive calls on a cold pod, so this uses both layers: warm pods do
 * no I/O, and cold pods read the shared VBase entry instead of the Apps API.
 */
const cachedAppSettings = createCachedResource<AppSettings>('app-settings', {
  // One entry per account/workspace served by this pod.
  maxEntries: 50,
  memoryTtlMs: APP_SETTINGS_MEMORY_CACHE_TTL_MS,
  vbaseTtlMinutes: APP_SETTINGS_CACHE_TTL_IN_MINUTES,
})

export const getCachedAppSettings = async (
  ctx: Context
): Promise<AppSettings> => {
  const appId = process.env.VTEX_APP_ID ?? ''

  const cached = await cachedAppSettings(ctx, appId, () =>
    ctx.clients.apps.getAppSettings(appId).then((res) => (res ?? {}) as AppSettings)
  )

  return cached != null && typeof cached === 'object' ? cached : {}
}
