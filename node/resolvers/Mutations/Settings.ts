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

  const { active } = params

  settings.sessionWatcher = { active }

  const save = await vbase
    .saveJSON('b2b_settings', app, settings)
    .then(() => true)
    .catch((error) => {
      logger.error({
        message: 'sessionWatcher.saveSessionWatcherError',
        error,
      })

      return false
    })

  return save
}
