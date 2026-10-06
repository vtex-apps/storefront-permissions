/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'

import { sendMetric } from '../clients/metrics'
import {
  setActiveUserByOrganization,
  updateUser,
} from '../resolvers/Mutations/Users'
import { searchRoles } from '../resolvers/Queries/Roles'
import { getAppSettings } from '../resolvers/Queries/Settings'
import { getAllUsersByEmail, getUserByEmail } from '../resolvers/Queries/Users'
import { Routes } from '../resolvers/Routes'
import { sendChangeTeamMetric } from '../utils/metrics/changeTeam'
import schemas from '../mdSchema'
import { toHash } from '../utils'

jest.mock('co-body', () => ({ json: jest.fn() }))

jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../resolvers/Mutations/Roles', () => ({
  syncRoles: jest.fn().mockResolvedValue([]),
}))

jest.mock('../resolvers/Queries/Users', () => {
  const actual = jest.requireActual('../resolvers/Queries/Users')

  return {
    ...actual,
    getAllUsersByEmail: jest.fn(),
    getOrganizationsByEmail: jest.fn(),
    getUserByEmailOrgIdAndCostId: jest.fn(),
  }
})

jest.mock('../services/activeUserCache', () => {
  const actual = jest.requireActual('../services/activeUserCache')

  return {
    ...actual,
    getCachedActiveUserForPermissions: jest.fn(
      (_ctx: any, _email: string, fetcher: () => Promise<any>) => fetcher()
    ),
  }
})

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.8.10'

const sendMetricMock = sendMetric as jest.Mock
const jsonMock = json as jest.Mock
const getAllUsersByEmailMock = getAllUsersByEmail as jest.Mock

const logger = () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
})

const mdError = (status: number, message = 'md failed') => {
  const err: any = new Error(message)

  err.response = { status, data: { Message: message } }

  return err
}

describe('P2 error-log instrumentation (B2BTEAM-3970)', () => {
  beforeEach(() => {
    sendMetricMock.mockReset()
    sendMetricMock.mockResolvedValue(undefined)
    jsonMock.mockReset()
    getAllUsersByEmailMock.mockReset()
    getAllUsersByEmailMock.mockResolvedValue([])
  })

  describe('sendChangeTeamMetric', () => {
    it('logs with structured logger instead of console.warn on send failure', async () => {
      const log = logger()
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation()

      sendMetricMock.mockRejectedValue(new Error('analytics down'))

      await sendChangeTeamMetric(log as any, {
        account: 'acc',
        costCenterId: 'cost1',
        orgId: 'org1',
        userEmail: 'buyer@test.com',
        userId: 'u1',
        userRole: 'admin',
      })

      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'changeTeam.sendMetricError',
        })
      )
      expect(consoleWarn).not.toHaveBeenCalled()
      consoleWarn.mockRestore()
    })
  })

  describe('Roles.searchRoles', () => {
    it('logs and rethrows the original error on non-404 VBase failures', async () => {
      const log = logger()
      const vbaseError = mdError(500, 'vbase unavailable')

      const ctx: any = {
        clients: {
          masterdata: { searchDocuments: jest.fn() },
          vbase: { getJSON: jest.fn().mockRejectedValue(vbaseError) },
        },
        vtex: { logger: log, tenant: { locale: 'en-US' } },
      }

      await expect(searchRoles(null, ctx)).rejects.toBe(vbaseError)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Roles.searchRoles' })
      )
    })

    it('falls back to Master Data on VBase 404 without error log', async () => {
      const log = logger()
      const roles = [
        { features: [], id: 'r1', locked: false, name: 'A', slug: 'a' },
      ]

      const ctx: any = {
        clients: {
          masterdata: {
            searchDocuments: jest.fn().mockResolvedValue(roles),
          },
          vbase: {
            getJSON: jest.fn().mockRejectedValue(mdError(404)),
          },
        },
        vtex: { logger: log, tenant: { locale: 'en-US' } },
      }

      const result = await searchRoles(null, ctx)

      expect(result).toEqual(roles)
      expect(log.error).not.toHaveBeenCalled()
    })
  })

  describe('getAppSettings.schemaUpdateError', () => {
    it('logs non-304 schema-update failures with dataEntity and rethrows original', async () => {
      const log = logger()
      const schemaError = mdError(500, 'schema sync failed')

      const ctx: any = {
        clients: {
          masterdata: {
            createOrUpdateSchema: jest.fn().mockRejectedValue(schemaError),
          },
          vbase: {
            getJSON: jest.fn().mockResolvedValue({
              adminSetup: { schemaHash: 'stale-hash' },
            }),
            saveJSON: jest.fn(),
          },
        },
        vtex: { logger: log },
      }

      await expect(getAppSettings(null, null, ctx)).rejects.toBe(schemaError)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          dataEntity: expect.any(String),
          message: 'getAppSettings.schemaUpdateError',
          schemaName: expect.any(String),
        })
      )
      expect(ctx.clients.vbase.saveJSON).not.toHaveBeenCalled()
    })

    it('treats 304 as success and continues schema sync', async () => {
      const log = logger()
      const currHash = toHash(schemas)

      const ctx: any = {
        clients: {
          masterdata: {
            createOrUpdateSchema: jest
              .fn()
              .mockRejectedValue(mdError(304, 'not modified')),
          },
          vbase: {
            getJSON: jest.fn().mockResolvedValue({
              adminSetup: { schemaHash: 'stale-hash' },
            }),
            saveJSON: jest.fn(),
          },
        },
        vtex: { logger: log },
      }

      const settings = await getAppSettings(null, null, ctx)

      expect(settings.adminSetup.schemaHash).toBe(currHash)
      expect(log.error).not.toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'getAppSettings.schemaUpdateError',
        })
      )
    })
  })

  describe('getUserByEmail.error', () => {
    it('logs when reconstituting an error payload from the permissions cache path', async () => {
      const log = logger()

      const ctx: any = {
        clients: {
          masterdata: {
            searchDocumentsWithPaginationInfo: jest
              .fn()
              .mockRejectedValue(new Error('masterdata down')),
          },
        },
        vtex: {
          account: `p2email${Date.now()}`,
          logger: log,
          workspace: 'master',
        },
      }

      const [result] = await getUserByEmail(
        null,
        { email: 'buyer@test.com' },
        ctx
      )

      expect(result).toMatchObject({ status: 'error' })
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'getUserByEmail.error' })
      )
    })
  })

  describe('checkPermissions.getUserError', () => {
    it('logs when reconstituting an error payload from the user lookup', async () => {
      const log = logger()

      jsonMock.mockResolvedValue({
        app: 'test-app',
        email: 'buyer@test.com',
      })

      const ctx: any = {
        clients: {
          masterdata: {
            searchDocumentsWithPaginationInfo: jest
              .fn()
              .mockRejectedValue(new Error('md down')),
          },
          vbase: {
            getJSON: jest.fn().mockResolvedValue([]),
            saveJSON: jest.fn(),
          },
        },
        req: {},
        response: {},
        set: jest.fn(),
        vtex: {
          account: `p2perm${Date.now()}`,
          logger: log,
          workspace: 'master',
        },
      }

      await expect(Routes.checkPermissions(ctx)).rejects.toThrow()

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'checkPermissions.getUserError',
        })
      )
    })
  })

  describe('MD write helpers via updateUser / createPermission', () => {
    it('logs createPermission softSuccess when MD returns status < 400', async () => {
      const log = logger()
      const soft = mdError(204, 'no content')

      const ctx: any = {
        clients: {
          lm: {},
          masterdata: {
            createOrUpdateEntireDocument: jest.fn().mockRejectedValue(soft),
          },
        },
        vtex: { logger: log },
      }

      const result = await updateUser(
        null,
        {
          canImpersonate: false,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
          roleId: 'role1',
          userId: 'user1',
        },
        ctx
      )

      expect(result.status).toBe('success')
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'createPermission.softSuccess' })
      )
    })

    it('logs createPermission.error before returning error status on hard failure', async () => {
      const log = logger()
      const hard = mdError(500, 'write failed')

      const ctx: any = {
        clients: {
          lm: {},
          masterdata: {
            createOrUpdateEntireDocument: jest.fn().mockRejectedValue(hard),
          },
        },
        vtex: { logger: log },
      }

      const result = await updateUser(
        null,
        {
          canImpersonate: false,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
          roleId: 'role1',
          userId: 'user1',
        },
        ctx
      )

      expect(result.status).toBe('error')
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'createPermission.error' })
      )
    })

    it('logs addUserToMasterdata.duplicatedEntry when CL create hits duplicate', async () => {
      const log = logger()
      const duplicated: any = new Error('duplicated entry')

      duplicated.response = {
        data: { Message: 'duplicated entry' },
        status: 400,
      }

      const ctx: any = {
        clients: {
          lm: {},
          masterdata: {
            createDocument: jest.fn().mockRejectedValue(duplicated),
            createOrUpdateEntireDocument: jest
              .fn()
              .mockResolvedValue({ DocumentId: 'u1' }),
            searchDocuments: jest
              .fn()
              .mockResolvedValue([{ id: 'cl-existing' }]),
          },
        },
        vtex: { logger: log },
      }

      const result = await updateUser(
        null,
        {
          canImpersonate: false,
          costId: 'cost1',
          email: 'buyer@test.com',
          name: 'Buyer',
          orgId: 'org1',
          roleId: 'role1',
        },
        ctx
      )

      expect(result.status).toBe('success')
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'addUserToMasterdata.duplicatedEntry',
        })
      )
    })
  })

  describe('updateUserFields via setActiveUserByOrganization', () => {
    it('logs updateUserFields.error when activation write fails hard', async () => {
      const log = logger()
      const hard = mdError(500, 'activate failed')

      const ctx: any = {
        clients: {
          masterdata: {
            createOrUpdateEntireDocument: jest.fn().mockRejectedValue(hard),
            searchDocuments: jest.fn().mockResolvedValue([
              {
                active: false,
                costId: 'cost2',
                email: 'buyer@test.com',
                id: 'u2',
                orgId: 'org2',
              },
            ]),
          },
          masterDataExtended: {
            putDocumentById: jest.fn().mockResolvedValue(undefined),
          },
          session: {
            getSession: jest.fn().mockResolvedValue({ sessionData: null }),
          },
        },
        vtex: {
          account: 'acc',
          adminUserAuthToken: 'admin-token',
          logger: log,
          sessionToken: null,
          workspace: 'master',
        },
      }

      await expect(
        setActiveUserByOrganization(
          null,
          { costId: 'cost2', orgId: 'org2', userId: 'u2' },
          ctx
        )
      ).rejects.toBe(hard)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'updateUserFields.error' })
      )
    })
  })
})
