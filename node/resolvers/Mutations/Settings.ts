/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAppId } from '../Queries/Settings'

export const sessionWatcher = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { vbase },
    vtex: { logger },
  } = ctx

  const app: string = getAppId()

  const settings: any = await vbase.getJSON('b2b_settings', app).catch(() => {
    return {}
  })

  const { active, regionalizationType } = params

  settings.sessionWatcher = { active, regionalizationType }

  return vbase
    .saveJSON('b2b_settings', app, settings)
    .then(() => true)
    .catch((error) => {
      logger.error({
        error,
        message: 'sessionWatcher.saveSessionWatcherError',
      })

      return false
    })
}
