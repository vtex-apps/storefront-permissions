import {
  checkUserPermission,
  getOrganizationsByEmail,
} from '../resolvers/Queries/Users'

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.6.1'

const role = {
  features: [
    { features: ['add-users-organization'], module: 'vtex.b2b-organizations' },
  ],
  id: 'role1',
  locked: false,
  name: 'Buyer',
  slug: 'customer-admin',
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

let uniq = 0

const makeCtx = (): any => ({
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
  vtex: {
    account: `traceacc${uniq++}`,
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    sender: 'vtex.b2b-organizations@3.x',
    sessionData: {
      namespaces: {
        authentication: { storeUserEmail: { value: 'buyer@test.com' } },
        profile: { email: { value: 'buyer@test.com' } },
      },
    },
    workspace: 'master',
  },
})

describe('GraphQL hop traces', () => {
  it('emits checkUserPermission.timings with getUserByEmail vs getRole', async () => {
    const ctx = makeCtx()

    const result = await checkUserPermission(null, { skipError: true }, ctx)

    expect(result.permissions).toEqual(['add-users-organization'])

    const reported = ctx.vtex.logger.info.mock.calls.find(
      (call: any[]) => call[0]?.message === 'checkUserPermission.timings'
    )

    expect(reported?.[0]).toMatchObject({
      impersonating: false,
      module: 'vtex.b2b-organizations',
      permissionCount: 1,
      roleId: 'role1',
    })
    expect(reported?.[0].timings).toEqual(
      expect.objectContaining({
        getRole: expect.any(Number),
        getUserByEmail: expect.any(Number),
      })
    )
  })

  it('emits getOrganizationsByEmail.timings with the list fan-out size', async () => {
    const ctx = makeCtx()

    ctx.clients.masterdata.searchDocumentsWithPaginationInfo.mockResolvedValue({
      data: [
        userDoc,
        { ...userDoc, costId: 'cost2', id: 'u2', orgId: 'org2' },
        { ...userDoc, costId: 'cost3', id: 'u3', orgId: 'org3' },
      ],
      pagination: { page: 1, total: 3 },
    })

    const result = await getOrganizationsByEmail(
      null,
      { email: 'buyer@test.com' },
      ctx
    )

    expect(result).toHaveLength(3)

    const reported = ctx.vtex.logger.info.mock.calls.find(
      (call: any[]) => call[0]?.message === 'getOrganizationsByEmail.timings'
    )

    expect(reported?.[0]).toMatchObject({
      listedCount: 3,
      searchPagesEstimate: 1,
    })
    expect(reported?.[0].timings.listUsers).toEqual(expect.any(Number))
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalledTimes(1)
  })

  it('serves repeated checkUserPermission for the same email from the permissions cache', async () => {
    const ctx = makeCtx()
    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    await checkUserPermission(null, { skipError: true }, ctx)
    expect(lookups).toHaveBeenCalledTimes(1)

    await checkUserPermission(null, { skipError: true }, ctx)
    expect(lookups).toHaveBeenCalledTimes(1)
  })

  it('fetches remaining pages when the email has more than one page of records', async () => {
    const ctx = makeCtx()
    const page1 = Array.from({ length: 50 }, (_, i) => ({
      ...userDoc,
      id: `u${i}`,
    }))

    const page2 = [{ ...userDoc, id: 'u50', orgId: 'org2' }]

    ctx.clients.masterdata.searchDocumentsWithPaginationInfo
      .mockResolvedValueOnce({
        data: page1,
        pagination: { page: 1, total: 51 },
      })
      .mockResolvedValueOnce({
        data: page2,
        pagination: { page: 2, total: 51 },
      })

    const result = await getOrganizationsByEmail(
      null,
      { email: 'buyer@test.com' },
      ctx
    )

    expect(result).toHaveLength(51)
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalledTimes(2)
  })
})
