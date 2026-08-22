/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'

import { sendMetric } from '../clients/metrics'
import { setActiveUserByOrganization } from '../resolvers/Mutations/Users'
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

// Observability events post to the analytics endpoint; tests must never do
// real network I/O, and the assertions below inspect the payloads.
jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

process.env.VTEX_APP_ID = 'vtex.storefront-permissions@3.6.1'

const jsonMock = json as jest.Mock

const flush = () => new Promise((resolve) => setImmediate(resolve))

let uniq = 0

interface Scenario {
  appSettings?: Record<string, unknown>
  costCenterAddresses?: any[]
  lossyScan?: boolean
  organization?: Record<string, unknown>
  recoveredOrganization?: Record<string, unknown>
  sessionWatcherActive?: boolean
  userDocs?: any[]
}

const defaultAddress = {
  addressId: 'addr1',
  country: 'USA',
  geoCoordinates: null,
  postalCode: '12345',
}

const makeCtx = (scenario: Scenario = {}) => {
  const {
    appSettings = {},
    costCenterAddresses = [defaultAddress],
    lossyScan = false,
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
    userDocs = [
      {
        active: true,
        clId: 'cl1',
        costId: 'cost1',
        email: 'buyer@test.com',
        id: 'u1',
        name: 'Buyer',
        orgId: 'org1',
      },
    ],
  } = scenario

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
        createOrUpdatePartialDocument: jest
          .fn()
          .mockResolvedValue({ DocumentId: 'u1' }),
        // Applies the `where` clause and the pagination window the way Master
        // Data does, so a test can tell the active-only lookup apart from the
        // full scan instead of getting the same canned list for both.
        searchDocumentsWithPaginationInfo: jest
          .fn()
          .mockImplementation(({ where, pagination }: any) => {
            const wantsActive = where?.includes('active=true')
            const orgFilter = where?.match(/orgId=([^\s]+)/)?.[1]
            const costFilter = where?.match(/costId=([^\s]+)/)?.[1]

            // `lossyScan` simulates a paginated scan that intermittently comes
            // back without the active row, which can happen to users holding
            // many records. The filtered and targeted lookups are unaffected,
            // which is the whole point of using them.
            let matching = userDocs

            if (wantsActive) {
              matching = matching.filter((doc: any) => doc.active)
            } else if (orgFilter) {
              matching = matching.filter(
                (doc: any) =>
                  doc.orgId === orgFilter &&
                  (!costFilter || doc.costId === costFilter)
              )
            } else if (lossyScan) {
              matching = matching.filter((doc: any) => !doc.active)
            }

            const { page = 1, pageSize = 50 } = pagination ?? {}
            const start = (page - 1) * pageSize

            return Promise.resolve({
              data: matching.slice(start, start + pageSize),
              pagination: { page, total: matching.length },
            })
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
      '12345',
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
    expect(response.public.postalCode.value).toBe('12345')
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

    // Unwrapping `.data.getOrganizationById` (the GraphQL client's response
    // shape) would resolve to undefined and throw a TypeError here; this must
    // complete normally. The id-exact mock in makeCtx also fails this test if
    // the lookup uses the user record id ('u2') instead of the organization id
    // ('org2').
    const response = await run(ctx)

    expect(ctx.response.status).toBe(200)
    expect(getUserOrganizationsData).toHaveBeenCalled()

    // The response must be stamped with the recovered organization, not the
    // inactive one the stored selection points at.
    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2')
    expect(ctx.clients.organizations.getCostCenterById).toHaveBeenCalledWith(
      'cost2'
    )

    // The record id follows the adopted pair: the emitted userId must agree
    // with the organization this response is stamped with, and the
    // price-table lookup reads from it.
    expect(response['storefront-permissions'].userId.value).toBe('u2')

    // Marketing tags are fetched for the cost center the session was actually
    // placed in, not the unusable one it arrived with.
    expect(ctx.clients.organizations.getMarketingTags).toHaveBeenCalledWith(
      'cost2'
    )

    // Recovery must never write: which record is active belongs to the
    // shopper (organization switch) or to the account admin, so the transform
    // only shapes this response and reports what it found.
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.organizationRecovered'
    )

    expect(reported?.[0]).toMatchObject({
      recoveredOrgId: 'org2',
      unusableOrgId: 'org1',
    })

    // The log line is sampled by the platform pipeline; the exact count ships
    // as an analytics event. Identifiers only on that channel - never email.
    const event = (sendMetric as jest.Mock).mock.calls.find(
      (call: any[]) =>
        call[0]?.kind === 'b2b-storefront-permissions-organization-recovered'
    )

    expect(event?.[0].fields).toMatchObject({
      recoveredOrgId: 'org2',
      unusableOrgId: 'org1',
    })
    expect(JSON.stringify(event?.[0])).not.toContain('buyer@test.com')
  })

  it('recovers to the organization the session already carries, not the first of the list', async () => {
    // Without persistence the recovery reruns on every transform, and the
    // list-based pick is not stable. The pair the session carries must win,
    // so consecutive responses stay on the same organization.
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    // The list-based pick suggests org2/cost2...
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
      userDocs: [
        {
          active: true,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
        {
          active: false,
          clId: 'cl2b',
          costId: 'cost2b',
          email: 'buyer@test.com',
          id: 'u2b',
          name: 'Buyer',
          orgId: 'org2',
        },
      ],
    })

    // ...but this session was already resolved to org2/cost2b.
    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: 'cost2b' },
        hash: { value: '' },
        organization: { value: 'org2' },
      },
    })

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2b')
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
  })

  it('prefers the session-pinned pair on recovery when it is fully valid', async () => {
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
      userDocs: [
        {
          active: true,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
        {
          active: false,
          clId: 'clS',
          costId: 'costSticky',
          email: 'buyer@test.com',
          id: 'uS',
          name: 'Buyer',
          orgId: 'orgSticky',
        },
      ],
    })

    // The sticky organization must resolve as usable too.
    ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
      (entity: string, id: string) => {
        if (entity !== 'organizations') return Promise.resolve(undefined)
        if (id === 'org1')
          return Promise.resolve({ name: 'Inactive Org', status: 'inactive' })
        if (id === 'orgSticky')
          return Promise.resolve({
            collections: null,
            name: 'Sticky Org',
            priceTables: null,
            salesChannel: null,
            sellers: null,
            status: 'active',
            tradeName: null,
          })

        return Promise.resolve(undefined)
      }
    )

    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: 'costSticky' },
        hash: { value: '' },
        organization: { value: 'orgSticky' },
      },
    })

    // The pinned pair wins over the list candidate, keeping consecutive
    // responses stable.
    expect(response['storefront-permissions'].organization.value).toBe(
      'orgSticky'
    )
    expect(response['storefront-permissions'].costcenter.value).toBe(
      'costSticky'
    )
  })

  it('does not adopt the pinned pair when its cost center no longer exists', async () => {
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
      userDocs: [
        {
          active: true,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
        {
          active: false,
          clId: 'clS',
          costId: 'costGone',
          email: 'buyer@test.com',
          id: 'uS',
          name: 'Buyer',
          orgId: 'orgSticky',
        },
      ],
    })

    ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
      (entity: string, id: string) => {
        if (entity !== 'organizations') return Promise.resolve(undefined)
        if (id === 'org1')
          return Promise.resolve({ name: 'Inactive Org', status: 'inactive' })
        if (id === 'orgSticky')
          return Promise.resolve({ name: 'Sticky Org', status: 'active' })
        if (id === 'org2')
          return Promise.resolve({
            collections: null,
            name: 'Recovered Org',
            priceTables: null,
            salesChannel: null,
            sellers: null,
            status: 'active',
            tradeName: null,
          })

        return Promise.resolve(undefined)
      }
    )

    // The pinned record's cost center was deleted: Master Data answers a
    // document whose fields are all null.
    ctx.clients.organizations.getCostCenterById.mockImplementation(
      (id: string) =>
        id === 'costGone'
          ? Promise.resolve({
              data: {
                getCostCenterById: {
                  addresses: null,
                  businessDocument: null,
                  phoneNumber: null,
                  sellers: null,
                  stateRegistration: null,
                },
              },
            })
          : Promise.resolve({
              data: {
                getCostCenterById: {
                  addresses: [defaultAddress],
                  businessDocument: null,
                  phoneNumber: null,
                  sellers: null,
                  stateRegistration: null,
                },
              },
            })
    )

    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: 'costGone' },
        hash: { value: '' },
        organization: { value: 'orgSticky' },
      },
    })

    // Falls back to the list candidate, whose pair was validated, instead of
    // emitting a session for a deleted cost center.
    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2')

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'setProfile.stickyCostCenterInvalidOnRecovery'
    )

    expect(reported?.[0]).toMatchObject({ stickyCostId: 'costGone' })
  })

  it('does not recover into a fallback organization that is itself unusable', async () => {
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    orgsDataMock.mockResolvedValue({
      activeOrganization: { costId: 'cost2', id: 'u2', orgId: 'org2' },
      validCostCenterId: null,
    })

    // The list entry nominated org2, but its freshly fetched document says
    // otherwise - the nomination is stale. Adopting it would just move the
    // shopper into another unusable organization.
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
        name: 'Also On Hold',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'on-hold',
        tradeName: null,
      },
    })

    await expect(run(ctx)).rejects.toThrow()

    const reported = ctx.vtex.logger.error.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.organizationUnavailable'
    )

    expect(reported?.[0]).toMatchObject({ reason: 'organizationNotActive' })
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

    // Two empty answers: the active-only lookup, then the full scan it falls
    // back to when no record is active.
    lookups
      .mockResolvedValueOnce({ data: [], pagination: { page: 1, total: 0 } })
      .mockResolvedValueOnce({ data: [], pagination: { page: 1, total: 0 } })

    // First transform: user not provisioned yet, empty B2B session.
    const first = await run(ctx)

    expect(first['storefront-permissions'].organization.value).toBe('')

    // Second transform: the user now exists and must be found immediately -
    // a cached miss would pin the empty session for the whole TTL.
    const second = await run(ctx)

    expect(second['storefront-permissions'].organization.value).toBe('org1')
  })

  it('resolves the active record with a single filtered lookup', async () => {
    const ctx = makeCtx()
    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    await run(ctx)

    // Every lookup must carry the filter: an unfiltered scan would paginate
    // through all of a multi-organization user's records.
    for (const [args] of lookups.mock.calls) {
      expect(args.where).toContain('active=true')
    }
  })

  it('finds the active record even when the unfiltered scan loses it', async () => {
    // A multi-record user whose paginated scan comes back without the active
    // row: without the filter, the resolution falls back to `users[0]` and
    // drops the shopper into an arbitrary organization.
    // Filtering in Master Data returns the active record in a single call,
    // so the lossy scan never runs.
    const ctx = makeCtx({
      lossyScan: true,
      recoveredOrganization: {
        collections: null,
        name: 'Active Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
      userDocs: [
        {
          active: false,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
        {
          active: true,
          clId: 'cl2',
          costId: 'cost2',
          email: 'buyer@test.com',
          id: 'u2',
          name: 'Buyer',
          orgId: 'org2',
        },
      ],
    })

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2')
  })

  it('falls back read-only when the user has no active record', async () => {
    // Records are created with active=false, so a user who never picked an
    // organization legitimately has none active. The fallback must be
    // deterministic and must not write: the record is unvalidated and could
    // point at an inactive or deleted organization, and persisting it would
    // make a bad selection permanent.
    const ctx = makeCtx({
      userDocs: [
        {
          active: false,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
      ],
    })

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org1')
    expect(
      ctx.clients.masterdata.createOrUpdatePartialDocument
    ).not.toHaveBeenCalled()

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'getActiveUserByEmail-noActiveRecord'
    )

    expect(reported?.[0]).toMatchObject({
      fallbackRecordId: 'u1',
      totalRecords: 1,
    })
  })

  it('keeps the organization the session already carries when none is active', async () => {
    // Without stickiness the resolution below is re-derived every transform and
    // can drift for users with many records, making a cost center switch appear
    // not to stick. 'org2' is not the record the plain scan would pick.
    const ctx = makeCtx({
      recoveredOrganization: {
        collections: null,
        name: 'Sticky Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
      userDocs: [
        {
          active: false,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
        {
          active: false,
          clId: 'cl2',
          costId: 'cost2',
          email: 'buyer@test.com',
          id: 'u2',
          name: 'Buyer',
          orgId: 'org2',
        },
      ],
    })

    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        hash: { value: '' },
        organization: { value: 'org2' },
      },
    })

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2')
  })

  it('keeps the exact cost center when the organization has several', async () => {
    // A shopper can hold one record per cost center inside the same
    // organization, so pinning on the organization alone would pick an
    // arbitrary cost center - the same drift, one level down.
    const ctx = makeCtx({
      recoveredOrganization: {
        collections: null,
        name: 'Sticky Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
      userDocs: [
        {
          active: false,
          clId: 'clA',
          costId: 'costA',
          email: 'buyer@test.com',
          id: 'uA',
          name: 'Buyer',
          orgId: 'org2',
        },
        {
          active: false,
          clId: 'clB',
          costId: 'costB',
          email: 'buyer@test.com',
          id: 'uB',
          name: 'Buyer',
          orgId: 'org2',
        },
      ],
    })

    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: 'costB' },
        hash: { value: '' },
        organization: { value: 'org2' },
      },
    })

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('costB')
  })

  it('stays in the organization when only the pinned cost center is gone', async () => {
    const ctx = makeCtx({
      recoveredOrganization: {
        collections: null,
        name: 'Sticky Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'active',
        tradeName: null,
      },
      userDocs: [
        {
          active: false,
          clId: 'clA',
          costId: 'costA',
          email: 'buyer@test.com',
          id: 'uA',
          name: 'Buyer',
          orgId: 'org2',
        },
      ],
    })

    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: 'costGone' },
        hash: { value: '' },
        organization: { value: 'org2' },
      },
    })

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('costA')

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) =>
        call[0]?.message ===
        'getActiveUserByEmail-stickyCostCenterNoLongerAvailable'
    )

    expect(reported?.[0]).toMatchObject({ stickyCostId: 'costGone' })
  })

  it('falls back and reports when the session organization is no longer available', async () => {
    // The shopper was removed from the organization the session was pinned to.
    const ctx = makeCtx({
      userDocs: [
        {
          active: false,
          clId: 'cl1',
          costId: 'cost1',
          email: 'buyer@test.com',
          id: 'u1',
          name: 'Buyer',
          orgId: 'org1',
        },
      ],
    })

    const response = await run(ctx, {
      ...makeBody(),
      'storefront-permissions': {
        hash: { value: '' },
        organization: { value: 'orgGone' },
      },
    })

    expect(response['storefront-permissions'].organization.value).toBe('org1')

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'getActiveUserByEmail-stickyOrgNoLongerAvailable'
    )

    expect(reported?.[0]).toMatchObject({ stickyOrgId: 'orgGone' })
  })

  it('logs an explicit reason when the organization no longer exists', async () => {
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    orgsDataMock.mockResolvedValue({
      activeOrganization: null,
      validCostCenterId: null,
    })

    // No document for 'org1': the active record points at a deleted org.
    const ctx = makeCtx({ organization: undefined })

    ctx.clients.masterDataExtended.getDocumentById.mockResolvedValue(undefined)

    await expect(run(ctx)).rejects.toThrow('Organization not found')

    const reported = ctx.vtex.logger.error.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.organizationUnavailable'
    )

    // The sessions service turns this into a generic 502, so the log is the
    // only place that says which shopper and which organization failed.
    expect(reported?.[0]).toMatchObject({
      email: 'buyer@test.com',
      organizationId: 'org1',
      reason: 'organizationNotFound',
    })
  })

  it('treats an on-hold organization as unusable, like b2b-organizations does', async () => {
    // b2b-organizations' own checkOrganizationIsActive answers
    // `status === 'active'`, so 'on-hold' must not be shoppable here either.
    // The previous `!== 'inactive'` check let it through.
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    orgsDataMock.mockResolvedValue({
      activeOrganization: { costId: 'cost2', id: 'u2', orgId: 'org2' },
      validCostCenterId: null,
    })

    const ctx = makeCtx({
      organization: {
        collections: null,
        name: 'On Hold Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'on-hold',
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

    const response = await run(ctx)

    expect(getUserOrganizationsData).toHaveBeenCalled()
    expect(response['storefront-permissions'].organization.value).toBe('org2')
  })

  it('reports a status it does not know about instead of failing silently', async () => {
    const orgsDataMock = getUserOrganizationsData as jest.Mock

    orgsDataMock.mockResolvedValue({
      activeOrganization: null,
      validCostCenterId: null,
    })

    const ctx = makeCtx({
      organization: {
        collections: null,
        name: 'Odd Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'suspended-by-finance',
        tradeName: null,
      },
    })

    // Fails closed: an unrecognized status is not shoppable.
    await expect(run(ctx)).rejects.toThrow()

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'setProfile.unknownOrganizationStatus'
    )

    expect(reported?.[0]).toMatchObject({ status: 'suspended-by-finance' })
  })

  it('sanitizes the cart address and reports what it removed', async () => {
    const ctx = makeCtx({
      costCenterAddresses: [
        {
          ...defaultAddress,
          reference: '{ "street2":"","street3":""}',
        },
      ],
    })

    await run(ctx)

    const sent =
      ctx.clients.checkout.updateOrderFormShipping.mock.calls[0]?.[1]

    // Checkout must receive the cleaned value, otherwise it answers CHK0040 and
    // discards the whole attachment, leaving the previous address on the cart.
    expect(sent.address.reference).toBe('{ street2:,street3:}')

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.code === 'CART_ADDRESS_SANITIZED'
    )

    expect(reported?.[0]).toMatchObject({
      costCenterAddressId: 'addr1',
      fields: [{ field: 'reference', removed: ['"'] }],
      message: 'setProfile.cartAddressSanitized',
      orgId: 'org1',
    })

    // No address values at any level: they are personal data and this runs on
    // every session transform.
    expect(JSON.stringify(reported?.[0])).not.toContain('street2')
  })

  it('reports a rejected postal code instead of shipping to a different place', async () => {
    const ctx = makeCtx({
      costCenterAddresses: [{ ...defaultAddress, postalCode: '12345%' }],
    })

    await run(ctx)

    const reported = ctx.vtex.logger.error.mock.calls.find(
      (call: any[]) => call[0]?.code === 'CART_ADDRESS_FIELD_REJECTED'
    )

    expect(reported?.[0]).toMatchObject({
      fields: [{ field: 'postalCode', removed: ['%'] }],
      orgId: 'org1',
    })

    // Never rewritten: a stripped postal code is a different location.
    const sent =
      ctx.clients.checkout.updateOrderFormShipping.mock.calls[0]?.[1]

    expect(sent.address.postalCode).toBe('12345%')
  })

  it('never logs address values, even with payload logging on', async () => {
    const ctx = makeCtx({
      appSettings: { logSessionPayloads: true },
      costCenterAddresses: [
        {
          ...defaultAddress,
          reference: '{ "street2":"CONFIDENTIAL"}',
          street: 'Private Road 9',
        },
      ],
    })

    await run(ctx)

    const sanitizedLog = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.code === 'CART_ADDRESS_SANITIZED'
    )

    expect(JSON.stringify(sanitizedLog?.[0])).not.toContain('CONFIDENTIAL')
  })

  it('tags a cart address update that still fails after sanitizing', async () => {
    const ctx = makeCtx({
      costCenterAddresses: [
        { ...defaultAddress, reference: 'has "quotes"' },
      ],
    })

    // Shaped like a real axios rejection: `config.data` carries the request
    // body, which is the shopper's address. Logging the error object whole
    // would carry it into the logs, so the described object must not.
    ctx.clients.checkout.updateOrderFormShipping.mockRejectedValue({
      config: {
        data: JSON.stringify({ address: { street: 'Private Road 9' } }),
      },
      message: 'Request failed with status code 400',
      response: {
        data: { error: { code: 'CHK0040', message: 'reference field' } },
        status: 400,
      },
    })

    await run(ctx)

    const reported = ctx.vtex.logger.error.mock.calls.find(
      (call: any[]) => call[0]?.code === 'CART_ADDRESS_UPDATE_FAILED'
    )

    expect(reported?.[0]).toMatchObject({
      error: { status: 400, vtexErrorCode: 'CHK0040' },
      sanitizedFields: ['reference'],
    })

    expect(JSON.stringify(reported?.[0])).not.toContain('Private Road')
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
