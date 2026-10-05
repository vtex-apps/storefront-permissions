/* eslint-disable @typescript-eslint/no-explicit-any */
import { describeClientError } from '../../utils/clientError'
import {
  B2B_SETTINGS_BUCKET,
  readB2BSettingsOrThrow,
} from '../../utils/b2bSettings'
import { getAppId } from '../Queries/Settings'

export const sessionWatcher = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { vbase },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()

  let settings: any

  try {
    settings = await readB2BSettingsOrThrow(
      vbase,
      app,
      logger,
      'sessionWatcher.readSettingsError'
    )
  } catch {
    // Fail-closed: never saveJSON after a non-404 VBase read failure.
    // Mutation return type is boolean — surface failure without throwing.
    return false
  }

  const { active } = params

  settings.sessionWatcher = { active }

  return vbase
    .saveJSON(B2B_SETTINGS_BUCKET, app, settings)
    .then(() => true)
    .catch((error: any) => {
      logger.error({
        error: describeClientError(error),
        message: 'sessionWatcher.saveSessionWatcherError',
      })

      return false
    })
}
