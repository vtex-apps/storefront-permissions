import schemas from '../../mdSchema'
import { toHash } from '../../utils'
import {
  B2B_SETTINGS_BUCKET,
  readB2BSettingsOrThrow,
} from '../../utils/b2bSettings'
import { describeClientError } from '../../utils/clientError'
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

  // Fail-closed RMW: 404 bootstraps {}; 5xx/timeout aborts before any saveJSON.
  const settings = (await readB2BSettingsOrThrow(
    vbase,
    app,
    logger,
    'getAppSettings.readSettingsError'
  )) as {
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
      .catch((error: any) => {
        if (error.response.status !== 304) {
          logger.error({
            error: describeClientError(error),
            message: 'getAppSettings-error',
          })

          throw new Error(error)
        }
      })

    await vbase.saveJSON(B2B_SETTINGS_BUCKET, app, settings)
  }

  const roles: any = await syncRoles(ctx).catch((error: any) => {
    logger.warn({
      error: describeClientError(error),
      message: 'getAppSettings.syncRolesError',
    })

    return []
  })

  settings.adminSetup.roles = !!roles.length

  return settings
}

export const getSessionWatcher = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { vbase },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()

  const settings: any = await vbase
    .getJSON(B2B_SETTINGS_BUCKET, app)
    .catch((error: any) => {
      logger.warn({
        error: describeClientError(error),
        message: 'getSessionWatcher.readSettingsError',
      })

      return {}
    })

  try {
    return settings?.sessionWatcher?.active ?? true
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'getSessionWatcher.getSessionWatcherError',
    })

    return { status: 'error', message: error }
  }
}
