/* eslint-disable @typescript-eslint/no-explicit-any */
import { isExpectedAnonymousRedirect } from '../clients/checkout'
import { sessionWatcher } from '../resolvers/Mutations/Settings'
import { getAppSettings } from '../resolvers/Queries/Settings'
import { getUser } from '../resolvers/Queries/Users'
import { isVBaseNotFound, readB2BSettingsOrThrow } from '../utils/b2bSettings'
import schemas from '../mdSchema'
import { toHash } from '../utils'

jest.mock('../resolvers/Mutations/Roles', () => ({
  syncRoles: jest.fn().mockResolvedValue([]),
}))

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.8.7'

const logger = () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
})

const vbaseError = (status?: number) => {
  const err: any = new Error(
    status ? `Request failed with status code ${status}` : 'vbase down'
  )

  if (status != null) {
    err.response = { status }
  }

  return err
}

describe('B2BTEAM-3969 fail-closed P0', () => {
  describe('isVBaseNotFound / readB2BSettingsOrThrow', () => {
    it('treats only HTTP 404 as not-found', () => {
      expect(isVBaseNotFound(vbaseError(404))).toBe(true)
      expect(isVBaseNotFound(vbaseError(500))).toBe(false)
      expect(isVBaseNotFound(new Error('timeout'))).toBe(false)
    })

    it('returns {} on 404 without logging', async () => {
      const log = logger()
      const vbase = {
        getJSON: jest.fn().mockRejectedValue(vbaseError(404)),
      }

      const settings = await readB2BSettingsOrThrow(
        vbase as any,
        'vtex.storefront-permissions',
        log as any,
        'test.readSettingsError'
      )

      expect(settings).toEqual({})
      expect(log.error).not.toHaveBeenCalled()
    })

    it('logs and rethrows on non-404 read failure', async () => {
      const log = logger()
      const err = vbaseError(503)
      const vbase = { getJSON: jest.fn().mockRejectedValue(err) }

      await expect(
        readB2BSettingsOrThrow(
          vbase as any,
          'vtex.storefront-permissions',
          log as any,
          'test.readSettingsError'
        )
      ).rejects.toBe(err)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'test.readSettingsError' })
      )
    })
  })

  describe('sessionWatcher RMW', () => {
    it('bootstraps on 404 and saves sessionWatcher flag', async () => {
      const log = logger()
      const saveJSON = jest.fn().mockResolvedValue(undefined)
      const ctx: any = {
        clients: {
          vbase: {
            getJSON: jest.fn().mockRejectedValue(vbaseError(404)),
            saveJSON,
          },
        },
        vtex: { logger: log },
      }

      const ok = await sessionWatcher(null, { active: false }, ctx)

      expect(ok).toBe(true)
      expect(saveJSON).toHaveBeenCalledWith(
        'b2b_settings',
        'vtex.storefront-permissions',
        { sessionWatcher: { active: false } }
      )
    })

    it('does not saveJSON on non-404 VBase read failure', async () => {
      const log = logger()
      const saveJSON = jest.fn()
      const ctx: any = {
        clients: {
          vbase: {
            getJSON: jest.fn().mockRejectedValue(vbaseError(500)),
            saveJSON,
          },
        },
        vtex: { logger: log },
      }

      const ok = await sessionWatcher(null, { active: true }, ctx)

      expect(ok).toBe(false)
      expect(saveJSON).not.toHaveBeenCalled()
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'sessionWatcher.readSettingsError',
        })
      )
    })
  })

  describe('getAppSettings RMW', () => {
    it('does not saveJSON when VBase read fails with non-404', async () => {
      const log = logger()
      const saveJSON = jest.fn()
      const createOrUpdateSchema = jest.fn()
      const ctx: any = {
        clients: {
          masterdata: { createOrUpdateSchema },
          vbase: {
            getJSON: jest.fn().mockRejectedValue(vbaseError(502)),
            saveJSON,
          },
        },
        vtex: { logger: log },
      }

      await expect(getAppSettings(null, null, ctx)).rejects.toBeTruthy()

      expect(saveJSON).not.toHaveBeenCalled()
      expect(createOrUpdateSchema).not.toHaveBeenCalled()
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'getAppSettings.readSettingsError',
        })
      )
    })

    it('bootstraps on 404 and may saveJSON after schema sync', async () => {
      const log = logger()
      const saveJSON = jest.fn().mockResolvedValue(undefined)
      const createOrUpdateSchema = jest.fn().mockResolvedValue(undefined)
      const ctx: any = {
        clients: {
          masterdata: { createOrUpdateSchema },
          vbase: {
            getJSON: jest.fn().mockRejectedValue(vbaseError(404)),
            saveJSON,
          },
        },
        vtex: { logger: log },
      }

      const settings = await getAppSettings(null, null, ctx)

      expect(settings.adminSetup.schemaHash).toBe(toHash(schemas))
      expect(saveJSON).toHaveBeenCalled()
    })
  })

  describe('getUser', () => {
    it('returns null for not-found after successful MD round-trip', async () => {
      const log = logger()
      const ctx: any = {
        clients: {
          masterdata: {
            getDocument: jest.fn().mockResolvedValue(null),
            searchDocuments: jest.fn(),
          },
        },
        vtex: { logger: log },
      }

      expect(await getUser(null, { id: 'missing' }, ctx)).toBeNull()
      expect(log.error).not.toHaveBeenCalled()
    })

    it('throws on MD failure and does not look like a successful user', async () => {
      const log = logger()
      const mdError = new Error('MD unavailable')
      const ctx: any = {
        clients: {
          masterdata: {
            getDocument: jest.fn().mockRejectedValue(mdError),
            searchDocuments: jest.fn(),
          },
        },
        vtex: { logger: log },
      }

      await expect(getUser(null, { id: 'cl-1' }, ctx)).rejects.toBe(mdError)

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Profiles.getUser-error' })
      )

      // Guard against the old fail-open shape that callers could spread as a user.
      await expect(getUser(null, { id: 'cl-1' }, ctx)).rejects.not.toEqual(
        expect.objectContaining({ status: 'error' })
      )
      await expect(getUser(null, { id: 'cl-1' }, ctx)).rejects.toMatchObject({
        message: 'MD unavailable',
      })
    })
  })

  describe('changeToAnonymousUser redirect predicate', () => {
    it('treats 302 (and other 3xx) as expected success', () => {
      expect(isExpectedAnonymousRedirect({ response: { status: 302 } })).toBe(
        true
      )
      expect(isExpectedAnonymousRedirect({ response: { status: 301 } })).toBe(
        true
      )
    })

    it('rethrows path: 500 and missing response are not redirects', () => {
      expect(isExpectedAnonymousRedirect({ response: { status: 500 } })).toBe(
        false
      )
      expect(isExpectedAnonymousRedirect({ code: '302' })).toBe(false)
      expect(isExpectedAnonymousRedirect(new Error('network'))).toBe(false)
    })

    it('uses response.status rather than AxiosError.code for 3xx', async () => {
      // Reproduce the old inverted predicate bug: code '302' with no response
      // must NOT be treated as success; a real 302 has response.status.
      const brokenPredicate = (err: any) => {
        if (!err.response || /^3..$/.test(err.code ?? '')) {
          throw err
        }
      }

      expect(() =>
        brokenPredicate({ code: 'ECONNABORTED', response: { status: 302 } })
      ).not.toThrow()

      // Correct predicate: status wins.
      expect(
        isExpectedAnonymousRedirect({
          code: 'ECONNABORTED',
          response: { status: 302 },
        })
      ).toBe(true)

      await expect(
        Promise.reject({ response: { status: 500 } }).catch((err) => {
          if (isExpectedAnonymousRedirect(err)) {
            return
          }

          throw err
        })
      ).rejects.toMatchObject({ response: { status: 500 } })

      const redirected = await Promise.reject({
        response: { status: 302 },
      }).catch((err) => {
        if (isExpectedAnonymousRedirect(err)) {
          return undefined
        }

        throw err
      })

      expect(redirected).toBeUndefined()
    })
  })
})
