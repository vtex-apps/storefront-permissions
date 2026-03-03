import { LRUCache } from '@vtex/api'

const APP_SETTINGS_CACHE_MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes
const APP_SETTINGS_CACHE_MAX_ENTRIES = 5000

const settingsCache = new LRUCache<string, Record<string, unknown>>({
  max: APP_SETTINGS_CACHE_MAX_ENTRIES,
})

/**
 * Returns app settings (manifest settingsSchema) with in-memory LRU cache
 * to avoid calling the Apps API on every setProfile request.
 * Cache key: account-workspace-appId. TTL: 5 minutes.
 */
export const getCachedAppSettings = async (
  ctx: Context
): Promise<Record<string, unknown>> => {
  const appId = process.env.VTEX_APP_ID ?? ''
  const vtex = ctx.vtex as unknown as Record<string, string>
  const account = vtex?.account ?? ''
  const workspace = vtex?.workspace ?? ''
  const cacheKey = `${account}-${workspace}-${appId}`

  const cached = await settingsCache.getOrSet(cacheKey, () =>
    ctx.clients.apps.getAppSettings(appId).then((res) => ({
      value: (res ?? {}) as Record<string, unknown>,
      maxAge: APP_SETTINGS_CACHE_MAX_AGE_MS,
    }))
  )

  return (cached != null && typeof cached === 'object' ? cached : {}) as Record<
    string,
    unknown
  >
}
