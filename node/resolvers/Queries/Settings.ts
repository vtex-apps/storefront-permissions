import schemas from '../../mdSchema'
import { toHash } from '../../utils'
import { syncRoles } from '../Mutations/Roles'
import type { ErrorResponse } from '../Routes/utils'

export const getAppId = (): string => {
  const app = process.env.VTEX_APP_ID
  const [appName] = String(app).split('@')

  return appName
}

export const getAppSettings = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
    vtex: { logger },
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

  const currHash = toHash(schemas)

  if (
    !settings.adminSetup?.schemaHash ||
    settings.adminSetup?.schemaHash !== currHash
  ) {
    const updates: Array<Promise<boolean>> = []

    schemas.forEach((schema) => {
      updates.push(
        masterdata
          .createOrUpdateSchema({
            dataEntity: schema.name,
            schemaBody: schema.body,
            schemaName: schema.version,
          })
          .then(() => true)
          .catch((error: ErrorResponse) => {
            if (error.response.status !== 304) {
              throw error
            }

            return true
          })
      )
    })

    await Promise.all(updates)
      .then(() => {
        settings.adminSetup.schemaHash = currHash
      })
      .catch((error) => {
        if (error.response.status !== 304) {
          logger.error({
            error,
            message: 'getAppSettings-error',
          })

          throw new Error(error)
        }
      })

    await vbase.saveJSON('b2b_settings', app, settings)
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
  // applies when settings?.sessionWatcher == undefined for new accounts

  const defaultSettingsSessionWatcher = {
    active: true,
    regionalizationType: 'DEFAULTV2',
  }

  const settings: any = await vbase.getJSON('b2b_settings', app).catch(() => {
    return {}
  })

  try {
    return settings?.sessionWatcher ?? defaultSettingsSessionWatcher
  } catch (error) {
    logger.error({
      error,
      message: 'getSessionWatcher.getSessionWatcherError',
    })

    return { status: 'error', message: error }
  }
}
