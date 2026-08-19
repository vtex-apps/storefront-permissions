/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'

import { Routes } from '../resolvers/Routes'

jest.mock('co-body', () => ({ json: jest.fn() }))

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.6.1'

const jsonMock = json as jest.Mock

let uniq = 0

const role = {
  features: [{ features: ['perm1', 'perm2'], module: 'test-app' }],
  id: 'role1',
  locked: false,
  name: 'Admin',
  slug: 'admin',
}

const userDoc = {
  active: true,
  clId: 'cl1',
  costId: 'cost1',
  email: 'buyer@test.com',
  id: 'u1',
  name: 'Buyer',
  orgId: 'org1',
  roleId: 'role1',
}

const makeCtx = () =>
  ({
    clients: {
      masterdata: {
        searchDocumentsWithPaginationInfo: jest.fn().mockResolvedValue({
          data: [userDoc],
          pagination: { page: 1, total: 1 },
        }),
      },
      vbase: {
        getJSON: jest.fn().mockImplementation((bucket: string) => {
          if (bucket === 'b2b_roles') {
            return Promise.resolve([role])
          }

          return Promise.resolve(null)
        }),
        saveJSON: jest.fn().mockResolvedValue(undefined),
      },
    },
    req: {},
    response: {},
    set: jest.fn(),
    vtex: {
      // Module-level caches are account-scoped, so a unique account per ctx
      // keeps tests isolated from each other.
      account: `permacc${uniq++}`,
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      workspace: 'master',
    },
  } as any)

const run = async (ctx: any, params: any = {}) => {
  jsonMock.mockResolvedValue({
    app: 'test-app',
    email: 'buyer@test.com',
    ...params,
  })

  await Routes.checkPermissions(ctx)

  return ctx.response.body
}

describe('checkPermissions', () => {
  it('resolves the role and permissions for the requested app', async () => {
    const ctx = makeCtx()
    const response = await run(ctx)

    expect(ctx.response.status).toBe(200)
    expect(response.role.id).toBe('role1')
    expect(response.permissions).toEqual(['perm1', 'perm2'])
  })

  it('returns empty permissions when the app has no module in the role', async () => {
    const ctx = makeCtx()
    const response = await run(ctx, { app: 'unknown-app' })

    expect(response.permissions).toEqual([])
    expect(response.role.id).toBe('role1')
  })

  it('serves repeated checks for the same email from the permissions cache', async () => {
    const ctx = makeCtx()
    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    await run(ctx)
    // One resolution = two Master Data calls (count probe + one page).
    expect(lookups).toHaveBeenCalledTimes(2)

    await run(ctx)
    // This route is called per request by sibling B2B apps, so the second
    // check must be a cache hit.
    expect(lookups).toHaveBeenCalledTimes(2)
  })

  it('does not share cached users between accounts', async () => {
    const first = makeCtx()
    const second = makeCtx()

    await run(first)
    await run(second)

    expect(
      first.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalledTimes(2)
    expect(
      second.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalledTimes(2)
  })

  it('rejects requests without an app or an email', async () => {
    await expect(run(makeCtx(), { app: null })).rejects.toThrow(
      'App not defined'
    )
    await expect(run(makeCtx(), { email: null })).rejects.toThrow(
      'Email not defined'
    )
  })
})
