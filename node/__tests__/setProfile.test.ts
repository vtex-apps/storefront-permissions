/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'

import { Routes } from '../resolvers/Routes'
import {
  generateClUser,
  getUserOrganizationsData,
} from '../resolvers/Routes/utils'
import { toHash } from '../utils'

jest.mock('co-body', () => ({ json: jest.fn() }))

jest.mock('../resolvers/Routes/utils', () => ({
  ...jest.requireActual('../resolvers/Routes/utils'),
  generateClUser: jest.fn().mockResolvedValue(null),
  getUserOrganizationsData: jest.fn(),
}))

jest.mock('../resolvers/Mutations/Users', () => ({
  getUser: jest.fn(),
  setActiveUserByOrganization: jest.fn().mockResolvedValue(undefined),
}))

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.6.1'

const jsonMock = json as jest.Mock

const flush = () => new Promise((resolve) => setImmediate(resolve))

let uniq = 0

interface Scenario {
  appSettings?: Record<string, unknown>
  costCenterAddresses?: any[]
  organization?: Record<string, unknown>
  recoveredOrganization?: Record<string, unknown>
  sessionWatcherActive?: boolean
}

const defaultAddress = {
  addressId: 'addr1',
  country: 'USA',
  geoCoordinates: null,
  postalCode: '53012',
}

const makeCtx = (scenario: Scenario = {}) => {
  const {
    appSettings = {},
    costCenterAddresses = [defaultAddress],
    organization = {
      collections: null,
      name: 'Test Org',
      priceTables: null,
      salesChannel: null,
      sellers: null,
      status: 'active',
      tradeName: null,
    },
    recoveredOrganization,
    sessionWatcherActive = true,
  } = scenario

  const userDoc = {
    active: true,
    clId: 'cl1',
    costId: 'cost1',
    email: 'buyer@test.com',
    id: 'u1',
    name: 'Buyer',
    orgId: 'org1',
  }

  const ctx: any = {
    clients: {
      apps: { getAppSettings: jest.fn().mockResolvedValue(appSettings) },
      checkout: {
        clearCart: jest.fn().mockResolvedValue({}),
        getRegionId: jest.fn().mockResolvedValue([{ id: 'v2.TESTREGION' }]),
        updateOrderFormMarketingData: jest.fn().mockResolvedValue({}),
        updateOrderFormProfile: jest.fn().mockResolvedValue({}),
        updateOrderFormShipping: jest.fn().mockResolvedValue({}),
        updateSalesChannel: jest.fn().mockResolvedValue({}),
      },
      masterDataExtended: {
        // Deliberately id-exact: the recovered organization only resolves for
        // its real organization id ('org2'). Fetching with any other id (for
        // example the b2b_users record id 'u2') returns undefined, exactly like
        // Master Data would - which is how the wrong-id lookup bug is caught.
        getDocumentById: jest.fn().mockImplementation((entity, id) => {
          if (entity !== 'organizations') {
            return Promise.resolve(undefined)
          }

          if (id === 'org1') {
            return Promise.resolve(organization)
          }

          if (recoveredOrganization && id === 'org2') {
            return Promise.resolve(recoveredOrganization)
          }

          return Promise.resolve(undefined)
        }),
      },
      masterdata: {
        searchDocumentsWithPaginationInfo: jest.fn().mockResolvedValue({
          data: [userDoc],
          pagination: { page: 1, total: 1 },
        }),
      },
      organizations: {
        getB2BSettings: jest.fn().mockResolvedValue({
          data: { getB2BSettings: { uiSettings: { clearCart: false } } },
        }),
        getCostCenterById: jest.fn().mockResolvedValue({
          data: {
            getCostCenterById: {
              addresses: costCenterAddresses,
              businessDocument: null,
              phoneNumber: null,
              sellers: null,
              stateRegistration: null,
            },
          },
        }),
        getMarketingTags: jest
          .fn()
          .mockResolvedValue({ data: { getMarketingTags: { tags: [] } } }),
        getOrganizationsByEmail: jest.fn(),
      },
      profileSystem: {},
      salesChannel: {
        getSalesChannel: jest
          .fn()
          .mockResolvedValue({ data: [{ Id: 1, IsActive: true }] }),
      },
      vbase: {
        getJSON: jest.fn().mockImplementation((bucket: string) => {
          if (bucket === 'b2b_settings') {
            return Promise.resolve({
              sessionWatcher: { active: sessionWatcherActive },
            })
          }

          // sfp-cache misses so every fetcher actually runs in tests.
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
      account: `testacc${uniq++}`,
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      tenant: { locale: 'en-US' },
      workspace: 'master',
    },
  }

  return ctx
}

const makeBody = () => ({
  authentication: { storeUserEmail: { value: 'buyer@test.com' } },
  checkout: { orderFormId: { value: 'of123' } },
  public: {},
  'storefront-permissions': { hash: { value: '' } },
})

const run = async (ctx: any, body: any = makeBody()) => {
  jsonMock.mockResolvedValue(body)
  await Routes.setProfile(ctx)
  await flush()

  return ctx.response.body
}

describe('setProfile', () => {
  it('returns the empty response and calls nothing when the watcher is off', async () => {
    const ctx = makeCtx({ sessionWatcherActive: false })
    const response = await run(ctx)

    expect(ctx.response.status).toBe(200)
    expect(response['storefront-permissions'].organization.value).toBe('')
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).not.toHaveBeenCalled()
  })

  it('falls back to the first active sales channel for a null-channel org', async () => {
    const ctx = makeCtx()
    const response = await run(ctx)

    expect(response.public.sc.value).toBe('1')
    expect(ctx.clients.checkout.updateSalesChannel).toHaveBeenCalledWith(
      'of123',
      1
    )
  })

  it('omits sc entirely when deferSalesChannelToBinding is on', async () => {
    const ctx = makeCtx({ appSettings: { deferSalesChannelToBinding: true } })
    const response = await run(ctx)

    expect(response.public.sc).toBeUndefined()
    expect(ctx.clients.checkout.updateSalesChannel).not.toHaveBeenCalled()
    // The region lookup still has a sales channel to work with.
    expect(response.public.regionId.value).toBe('v2.TESTREGION')
  })

  it('resolves the region from the cost center address by default', async () => {
    const ctx = makeCtx()
    const response = await run(ctx)

    expect(response.public.regionId.value).toBe('v2.TESTREGION')
    expect(ctx.clients.checkout.getRegionId).toHaveBeenCalledWith(
      'USA',
      '53012',
      '1',
      null
    )
    expect(response.public.postalCode).toBeUndefined()
  })

  it('publishes the locality instead of calling the regions API when deferRegionToCheckoutSession is on', async () => {
    const ctx = makeCtx({
      appSettings: { deferRegionToCheckoutSession: true },
    })

    const response = await run(ctx)

    expect(ctx.clients.checkout.getRegionId).not.toHaveBeenCalled()
    expect(response.public.regionId).toBeUndefined()
    expect(response.public.postalCode.value).toBe('53012')
    expect(response.public.country.value).toBe('USA')
  })

  it('falls back to the regions API when the address has no postal code, even with the flag on', async () => {
    const ctx = makeCtx({
      appSettings: { deferRegionToCheckoutSession: true },
      costCenterAddresses: [{ ...defaultAddress, postalCode: null }],
    })

    const response = await run(ctx)

    expect(ctx.clients.checkout.getRegionId).toHaveBeenCalled()
    expect(response.public.postalCode).toBeUndefined()
    expect(response.public.regionId.value).toBe('v2.TESTREGION')
  })

  it('recovers a user whose organization is inactive but has another active one', async () => {
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    orgsDataMock.mockResolvedValue({
      activeOrganization: { costId: 'cost2', id: 'u2', orgId: 'org2' },
      validCostCenterId: null,
    })

    const ctx = makeCtx({
      organization: {
        collections: null,
        name: 'Inactive Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'inactive',
        tradeName: null,
      },
      recoveredOrganization: {
        collections: null,
        name: 'Recovered Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
    })

    // With the old `.data.getOrganizationById` unwrap this threw a TypeError
    // and returned a 500; the fix must complete normally. The id-exact mock in
    // makeCtx also fails this test if the lookup uses the user record id ('u2')
    // instead of the organization id ('org2').
    const response = await run(ctx)

    expect(ctx.response.status).toBe(200)
    expect(getUserOrganizationsData).toHaveBeenCalled()

    // The response must be stamped with the organization that was just
    // activated, not the inactive one it arrived with.
    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2')
    expect(ctx.clients.organizations.getCostCenterById).toHaveBeenCalledWith(
      'cost2'
    )
  })

  it('clears the cart on inactive-org recovery even when the session hash matched the old org', async () => {
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    orgsDataMock.mockResolvedValue({
      activeOrganization: { costId: 'cost2', id: 'u2', orgId: 'org2' },
      validCostCenterId: null,
    })

    const ctx = makeCtx({
      organization: {
        collections: null,
        name: 'Inactive Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'inactive',
        tradeName: null,
      },
      recoveredOrganization: {
        collections: null,
        name: 'Recovered Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
    })

    ctx.clients.organizations.getB2BSettings.mockResolvedValue({
      data: { getB2BSettings: { uiSettings: { clearCart: true } } },
    })

    // The session arrives with the hash of the (now inactive) org1/cost1, so
    // the pre-recovery hashChanged is false; without recomputation the cart
    // would keep the old organization's items.
    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': { hash: { value: toHash('org1|cost1') } },
    })

    expect(response['storefront-permissions'].hash.value).toBe(
      toHash('org2|cost2')
    )
    expect(ctx.clients.checkout.clearCart).toHaveBeenCalledWith('of123')
  })

  it('does not let fallback branches mutate the cached user entry', async () => {
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    // The mock is module-level and earlier tests already invoked it; this test
    // asserts on call counts, so start from zero.
    orgsDataMock.mockClear()
    orgsDataMock.mockResolvedValue({
      activeOrganization: { costId: 'cost2', id: 'u2', orgId: 'org2' },
      validCostCenterId: null,
    })

    const ctx = makeCtx({
      organization: {
        collections: null,
        name: 'Inactive Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'inactive',
        tradeName: null,
      },
      recoveredOrganization: {
        collections: null,
        name: 'Recovered Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
    })

    // First run goes through the inactive-org recovery, which rewrites
    // user.orgId/costId locally.
    await run(ctx)
    expect(orgsDataMock).toHaveBeenCalledTimes(1)

    // Second run hits the active-user cache. If recovery had mutated the
    // shared cached object, this run would start from org2 and skip recovery
    // entirely; a pristine entry must re-enter the recovery path.
    await run(ctx)
    expect(orgsDataMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache a failed organization lookup', async () => {
    const ctx = makeCtx()

    ctx.clients.masterDataExtended.getDocumentById.mockRejectedValueOnce(
      new Error('master data blip')
    )

    // The failing request errors instead of resolving with a broken session...
    await expect(run(ctx)).rejects.toThrow('master data blip')

    // ...and the very next request retries the origin instead of reading a
    // cached empty organization for the whole TTL.
    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org1')
  })

  it('does not cache a user that was not found', async () => {
    const ctx = makeCtx()
    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    lookups.mockResolvedValueOnce({ data: [], pagination: { page: 1, total: 0 } })

    // First transform: user not provisioned yet, empty B2B session.
    const first = await run(ctx)

    expect(first['storefront-permissions'].organization.value).toBe('')

    // Second transform: the user now exists and must be found immediately -
    // a cached miss would pin the empty session for the whole TTL.
    const second = await run(ctx)

    expect(second['storefront-permissions'].organization.value).toBe('org1')
  })

  it('keeps full payload logging off unless logSessionPayloads is enabled', async () => {
    const quiet = makeCtx()

    await run(quiet)

    const quietPayloads = quiet.vtex.logger.info.mock.calls.filter(
      (call: any[]) => call[0] && call[0]['setProfile.body']
    )

    expect(quietPayloads).toHaveLength(0)

    const verbose = makeCtx({ appSettings: { logSessionPayloads: true } })

    await run(verbose)

    const verbosePayloads = verbose.vtex.logger.info.mock.calls.filter(
      (call: any[]) => call[0] && call[0]['setProfile.body']
    )

    expect(verbosePayloads).toHaveLength(1)
  })

  it('reuses the active-user lookup across runs and refetches when the cost center changes', async () => {
    // One ctx for all runs: the caches are account-scoped module singletons,
    // and this test is about sharing them across requests.
    const ctx = makeCtx()
    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    await run(ctx)
    // One resolution = two Master Data calls (count probe + one page).
    expect(lookups).toHaveBeenCalledTimes(2)

    await run(ctx)
    // Same email, same cost center: served from cache, no new lookup.
    expect(lookups).toHaveBeenCalledTimes(2)

    await run(ctx, {
      ...makeBody(),
      public: { b2bCurrentCostCenter: { value: 'cost2' } },
    })
    // setCurrentOrganization writes b2bCurrentCostCenter on an organization
    // switch; a different value must change the key and force a fresh lookup.
    expect(lookups).toHaveBeenCalledTimes(4)
  })

  it('does not block the response on the CL profile update', async () => {
    // The suite-level mock resolves null, which would skip the cart update and
    // make this test pass vacuously; return a real CL user so the hanging
    // update below is actually reached.
    const clUserMock = generateClUser as jest.Mock

    clUserMock.mockResolvedValueOnce({
      email: 'buyer@test.com',
      isCorporate: true,
      phone: null,
    })

    const ctx = makeCtx()

    // Even if the cart profile update hangs forever, the response returns.
    ctx.clients.checkout.updateOrderFormProfile.mockReturnValue(
      new Promise(() => undefined)
    )

    const response = await run(ctx)

    expect(response.public.facets).toBeDefined()
    expect(ctx.response.status).toBe(200)
    // Proves the fire-and-forget update genuinely started while still pending.
    expect(ctx.clients.checkout.updateOrderFormProfile).toHaveBeenCalledTimes(1)
  })
})
