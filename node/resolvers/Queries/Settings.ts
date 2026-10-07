import { syncRoles } from '../Mutations/Roles'

export const getAppId = (): string => {
  const app = process.env.VTEX_APP_ID
  const [appName] = String(app).split('@')

  return appName
}

/**
 * Master Data schema auto-update is disabled on this frozen major
 * (B2BTEAM-4245). The `b2b_settings` VBase key is shared by every installed
 * major, and some accounts carry manual schema customizations, so an old
 * major must never call `createOrUpdateSchema` or write the schema hash.
 * Settings are only read here; role sync is unchanged.
 */
export const getAppSettings = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { vbase },
  } = ctx

  const app: string = getAppId()

  const settings = (await vbase.getJSON('b2b_settings', app).catch(() => {
    return {}
  })) as {
    adminSetup: {
      schemaHash?: string | null
      roles?: string[] | boolean | null
    }
  }

  if (!settings.adminSetup) {
    settings.adminSetup = {}
  }

  const roles: any = await syncRoles(ctx).catch(() => [])

  settings.adminSetup.roles = !!roles.length

  return settings
}

export const getSessionWatcher = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { vbase },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()

  const settings: any = await vbase.getJSON('b2b_settings', app).catch(() => {
    return {}
  })

  try {
    return settings?.sessionWatcher?.active ?? true
  } catch (error) {
    logger.error({
      error,
      message: 'getSessionWatcher.getSessionWatcherError',
    })

    return { status: 'error', message: error }
  }
}
