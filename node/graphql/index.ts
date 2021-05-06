/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */

import schema from '../mdSchema'

export const SCHEMA_VERSION = 'v0.0.1'
const DATA_ENTITY = 'b2b-waffle'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export const resolvers = {
  Routes: {

  },
  Mutation: {
    saveAppSettings: async (_: any, __: any, ctx: Context) => {
      const {
        clients: { apps },
      } = ctx

      const app: string = getAppId()

      const newSettings = {

      }

      try {
        await apps.saveAppSettings(app, newSettings)

        return { status: 'success', message: '' }
      } catch (e) {
        return { status: 'error', message: e }
      }
    },
  },
  Query: {
    getAppSettings: async (_: any, __: any, ctx: Context) => {
      const {
        clients: { apps, masterdata },
      } = ctx

      const app: string = getAppId()
      const settings = await apps.getAppSettings(app)

      if (!settings.adminSetup) {
        settings.adminSetup = {}
      }



      if (
        !settings.adminSetup ||
        !settings.adminSetup?.hasSchema ||
        settings.adminSetup?.schemaVersion !== SCHEMA_VERSION
      ) {
        if (settings.adminSetup?.schemaVersion !== SCHEMA_VERSION) {
          try {
            await masterdata
              .createOrUpdateSchema({
                dataEntity: DATA_ENTITY,
                schemaName: SCHEMA_VERSION,
                schemaBody: schema,
              })
              .then(() => {
                settings.adminSetup.hasSchema = true
                settings.adminSetup.schemaVersion = SCHEMA_VERSION
              })
              .catch((e: any) => {
                settings.adminSetup.hasSchema = false
                // eslint-disable-next-line vtex/prefer-early-return
                if (e.response.status === 304) {
                  settings.adminSetup.hasSchema = true
                  settings.adminSetup.schemaVersion = SCHEMA_VERSION
                }
              })
          } catch (e) {
            settings.adminSetup.hasSchema = false
          }
        }

        await apps.saveAppSettings(app, settings)
      }

      return settings
    },

  },
}
