/* eslint-disable @typescript-eslint/naming-convention */

import schemas from '../mdSchema'
import {toHash} from '../utils'

import {deleteRole, saveRole} from './Mutations/Roles'
import {getRole, listRoles} from './Queries/Roles'
import {deleteUser, saveUser} from './Mutations/Users'
import {getFeaturesByModule, listFeatures} from './Queries/Features'
import {deleteProfile, saveProfile} from './Mutations/Profiles'
import {getProfile, getProfileByRole, listProfiles} from './Queries/Profiles'
import {getUser, getUserByEmail, listUsers, checkUserPermission} from './Queries/Users'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

export const resolvers = {
  Routes: {

  },
  Mutation: {
    deleteRole,
    saveRole,
    deleteProfile,
    saveProfile,
    deleteUser,
    saveUser,
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
    getRole,
    listRoles,
    getFeaturesByModule,
    listFeatures,
    getProfile,
    getProfileByRole,
    listProfiles,
    getUser,
    getUserByEmail,
    listUsers,
    checkUserPermission,
    getAppSettings: async (_: any, __: any, ctx: Context) => {
      const {
        clients: { apps, masterdata },
      } = ctx

      const app: string = getAppId()
      const settings = await apps.getAppSettings(app)

      if (!settings.adminSetup) {
        settings.adminSetup = {}
      }

      const currHash = toHash(schemas)
      if (
        !settings.adminSetup?.schemaHash ||
        settings.adminSetup?.schemaHash !== currHash
      ) {
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
            throw new Error(e)
          }
        })

        await apps.saveAppSettings(app, settings)
      }

      return settings
    },

  },
}
