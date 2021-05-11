/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
import * as crypto from 'crypto'
import schemas from '../mdSchema'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

const schemaHash = () => {
  return crypto.createHash('md5').update(JSON.stringify(schemas)).digest('hex')
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

      console.log('Settings =>', settings)

      const currHash = schemaHash()
      if (
        !settings.adminSetup?.schemaHash ||
        settings.adminSetup?.schemaHash !== currHash
      ) {
        console.log('Has changes')

        const updates: any = []

        schemas.map((schema) => {
          updates.push(masterdata
            .createOrUpdateSchema({
              dataEntity: schema.name,
              schemaName: schema.version,
              schemaBody: schema.body,
            })
            .then(() => true)
            .catch((e: any) => {
              if (e.response.status !== 304) {
                console.log(`Error saving schema ${schema.name}@${schema.version} =>`, e)
                throw e
              }
              return true
            })
            )

        })

        await Promise.all(updates).then(() => {
          settings.adminSetup.schemaHash = currHash
        }).catch((e) => {
          if (e.response.status !== 304) {
            console.log('Promise All catch =>', e)
          }
        })

        await apps.saveAppSettings(app, settings)
      }

      return settings
    },

  },
}
