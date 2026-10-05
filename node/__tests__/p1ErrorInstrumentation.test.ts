/* eslint-disable @typescript-eslint/no-explicit-any */
import { WithSession } from '../directives/withSession'
import { WithUserPermissions } from '../directives/withUserPermissions'
import { syncRoles } from '../resolvers/Mutations/Roles'
import { getAppSettings, getSessionWatcher } from '../resolvers/Queries/Settings'
import { checkImpersonation } from '../resolvers/Queries/Users'
import { Routes } from '../resolvers/Routes'
import schemas from '../mdSchema'
import { toHash } from '../utils'

jest.mock('../resolvers/Mutations/Roles', () => ({
  syncRoles: jest.fn(),
}))

jest.mock('../resolvers/Queries/Users', () => {
  const actual = jest.requireActual('../resolvers/Queries/Users')

  return {
    ...actual,
    checkUserPermission: jest.fn().mockResolvedValue({}),
  }
})

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.6.1'

const syncRolesMock = syncRoles as jest.Mock

const logger = () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
})

describe('P1 error-log instrumentation', () => {
  describe('withSession', () => {
    it('logs when session fetch fails and continues with null sessionData', async () => {
      const log = logger()
      const sessionError = new Error('session down')
      const field: any = {
        astNode: { name: { value: 'myQuery' } },
        resolve: jest.fn().mockResolvedValue('ok'),
      }

      new WithSession({}).visitFieldDefinition(field)

      const context = {
        clients: {
          logger: log,
          session: {
            getSession: jest.fn().mockRejectedValue(sessionError),
          },
        },
        request: { header: {}, url: '/graphql' },
        vtex: { sessionToken: 'token' },
      }

      await field.resolve(null, {}, context, {})

      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'withSession.getSessionError',
          operation: 'myQuery',
        })
      )
      expect(context.vtex.sessionData).toBeNull()
      expect(field.resolve).toHaveBeenCalled()
    })
  })

  describe('withUserPermissions', () => {
    it('logs when session fetch fails and continues with null sessionData', async () => {
      const log = logger()
      const field: any = {
        astNode: { name: { value: 'permsQuery' } },
        resolve: jest.fn().mockResolvedValue('ok'),
      }

      new WithUserPermissions({}).visitFieldDefinition(field)

      const context = {
        clients: {
          logger: log,
          session: {
            getSession: jest.fn().mockRejectedValue(new Error('session down')),
          },
        },
        graphql: { query: { senderApp: 'app' } },
        request: { url: '/graphql' },
        vtex: { sessionToken: 'token' },
      }

      await field.resolve(null, {}, context, {})

      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'withUserPermissions.getSessionError',
          operation: 'permsQuery',
        })
      )
      expect(context.vtex.sessionData).toBeNull()
    })
  })

  describe('getAppSettings.syncRoles', () => {
    it('logs syncRoles failures and returns roles flag false', async () => {
      const log = logger()
      const currHash = toHash(schemas)

      syncRolesMock.mockRejectedValue(new Error('roles sync failed'))

      const ctx: any = {
        clients: {
          masterdata: { createOrUpdateSchema: jest.fn() },
          vbase: {
            getJSON: jest.fn().mockResolvedValue({
              adminSetup: { schemaHash: currHash },
            }),
            saveJSON: jest.fn(),
          },
        },
        vtex: { logger: log },
      }

      const settings = await getAppSettings(null, null, ctx)

      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'getAppSettings.syncRolesError' })
      )
      expect(settings.adminSetup.roles).toBe(false)
    })
  })

  describe('getSessionWatcher', () => {
    it('logs VBase read failures and defaults watcher to active', async () => {
      const log = logger()

      const ctx: any = {
        clients: {
          vbase: {
            getJSON: jest.fn().mockRejectedValue(new Error('vbase unavailable')),
          },
        },
        vtex: { logger: log },
      }

      const active = await getSessionWatcher(null, null, ctx)

      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'getSessionWatcher.readSettingsError' })
      )
      expect(active).toBe(true)
    })
  })

  describe('checkImpersonation', () => {
    it('logs Profile System failures when resolving impersonated profile', async () => {
      const log = logger()

      const ctx: any = {
        clients: {
          fullSessions: {
            getSessions: jest.fn().mockResolvedValue({
              namespaces: {
                authentication: { storeUserEmail: { value: 'admin@test.com' } },
              },
            }),
          },
          profileSystem: {
            getProfileInfo: jest.fn().mockRejectedValue(new Error('CL down')),
          },
        },
        request: { headers: {} },
        vtex: {
          logger: log,
          sessionData: {
            namespaces: {
              profile: {
                email: { value: 'shopper@test.com' },
                id: { value: 'profile-1' },
              },
              'storefront-permissions': {
                storeUserId: { value: 'profile-1' },
              },
            },
          },
        },
      }

      const result = await checkImpersonation(null, null, ctx)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'checkImpersonation.getProfileInfoError',
          profileId: 'profile-1',
        })
      )
      expect(result).toEqual({ error: 'User not found' })
    })
  })

  describe('Routes.appSettings', () => {
    it('logs and rethrows when app settings cannot be loaded', async () => {
      const log = logger()
      const settingsError = new Error('apps client failed')

      const ctx: any = {
        clients: {
          apps: {
            getAppSettings: jest.fn().mockRejectedValue(settingsError),
          },
        },
        vtex: { logger: log },
      }

      await expect(Routes.appSettings(ctx)).rejects.toThrow(settingsError)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Routes.appSettings.getAppSettingsError',
        })
      )
    })
  })
})
