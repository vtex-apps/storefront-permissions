/* eslint-disable no-console */
import { syncRoles } from '../Mutations/Roles'
import schemas from '../../mdSchema'
import { toHash } from '../../utils'

const getAppId = (): string => {
  const app = process.env.VTEX_APP_ID
  const [appName] = String(app).split('@')

  return appName
}

export const getAppSettings = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
  } = ctx

  const app: string = getAppId()

  const settings: any = await vbase.getJSON('b2b_settings', app).catch(() => {
    return {}
  })

  console.log('Settings =>', settings)

  if (!settings.adminSetup) {
    settings.adminSetup = {}
  }

  const currHash = toHash(schemas)

  if (
    !settings.adminSetup?.schemaHash ||
    settings.adminSetup?.schemaHash !== currHash
  ) {
    const updates: any = []

    schemas.forEach((schema) => {
      updates.push(
        masterdata
          .createOrUpdateSchema({
            dataEntity: schema.name,
            schemaName: schema.version,
            schemaBody: schema.body,
          })
          .then(() => true)
          .catch((e: any) => {
            if (e.response.status !== 304) {
              console.log('Catch loop =>', e.response)
              throw e
            }

            return true
          })
      )
    })

    await Promise.all(updates)
      .then(() => {
        settings.adminSetup.schemaHash = currHash
      })
      .catch((e) => {
        console.log('Catch promise all =>', e.response)
        if (e.response.status !== 304) {
          throw new Error(e)
        }
      })

    await vbase.saveJSON('b2b_settigns', app, settings)
  }

  const roles: any = await syncRoles(ctx).catch(() => [])

  settings.adminSetup.roles = !!roles.length

  return settings
}
