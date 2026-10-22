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

const costCenterDoc = (
  addresses: any[] = [defaultAddress],
  overrides: Record<string, unknown> = {}
) => ({
  addresses,
  businessDocument: null,
  name: 'CC',
  organization: 'org1',
  phoneNumber: null,
  sellers: null,
  stateRegistration: null,
  ...overrides,
})

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
          if (entity === 'cost_centers') {
            return Promise.resolve(costCenterDoc(costCenterAddresses, { id }))
          }

          // Deliberately id-exact: the recovered organization only resolves for
          // its real organization id ('org2'). Fetching with any other id (for
          // example the b2b_users record id 'u2') returns undefined, exactly like
          // Master Data would - which is how the wrong-id lookup bug is caught.
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
        // Document read by id - what the selection path uses, and what the
        // search-based lookup deliberately does not.
        getDocument: jest
          .fn()
          .mockImplementation(({ id }: any) =>
            Promise.resolve(userDocs.find((doc: any) => doc.id === id) ?? null)
          ),
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
            } else if (orgFilter || costFilter) {
              matching = matching.filter(
                (doc: any) =>
                  (!orgFilter || doc.orgId === orgFilter) &&
                  (!costFilter || doc.costId === costFilter)
              )
            } else if (lossyScan) {
              matching = matching.filter((doc: any) => !doc.active)
            }

            const page: number = pagination?.page ?? 1
            const pageSize: number = pagination?.pageSize ?? 50
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
        getMarketingTags: jest
          .fn()
          .mockResolvedValue({ data: { getMarketingTags: { tags: [] } } }),
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

beforeEach(() => {
  ;(setActiveUserByOrganization as jest.Mock).mockClear()
  ;(sendMetric as jest.Mock).mockClear()
})

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

  it('omits public and storefront-permissions fields that match the session input', async () => {
    const ctx = makeCtx()
    const hash = toHash('org1|cost1')

    const body = {
      ...makeBody(),
      public: {
        facets: { value: ';' },
        sc: { value: '1' },
        regionId: { value: 'v2.TESTREGION' },
        costCenterAddressId: { value: 'addr1' },
      },
      'storefront-permissions': {
        hash: { value: hash },
        organization: { value: 'org1' },
        costcenter: { value: 'cost1' },
        costCenterAddressId: { value: 'addr1' },
      },
    }

    const response = await run(ctx, body)

    expect(response.public.facets).toBeUndefined()
    expect(response.public.sc).toBeUndefined()
    expect(response.public.regionId).toBeUndefined()
    expect(response['storefront-permissions'].hash).toBeUndefined()
    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(
      response['storefront-permissions'].costCenterAddressId
    ).toBeUndefined()
    expect(response['storefront-permissions'].userId.value).toBe('u1')
  })

  it('still emits organization and hash when the resolved pair changes', async () => {
    const ctx = makeCtx()
    const resolvedHash = toHash('org1|cost1')

    const body = {
      ...makeBody(),
      'storefront-permissions': {
        hash: { value: toHash('org1|cost-old') },
        organization: { value: 'org1' },
        costcenter: { value: 'cost-old' },
      },
    }

    const response = await run(ctx, body)

    expect(response['storefront-permissions'].costcenter.value).toBe('cost1')
    expect(response['storefront-permissions'].hash.value).toBe(resolvedHash)
  })

  it('omits postalCode and country on the defer-region path when they already match input', async () => {
    const ctx = makeCtx({
      appSettings: { deferRegionToCheckoutSession: true },
    })

    const body = {
      ...makeBody(),
      public: {
        postalCode: { value: '12345' },
        country: { value: 'USA' },
      },
      'storefront-permissions': {
        hash: { value: toHash('org1|cost1') },
        organization: { value: 'org1' },
        costcenter: { value: 'cost1' },
      },
    }

    const response = await run(ctx, body)

    expect(response.public.postalCode).toBeUndefined()
    expect(response.public.country).toBeUndefined()
    expect(response.public.regionId).toBeUndefined()
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
    expect(ctx.clients.masterDataExtended.getDocumentById).toHaveBeenCalledWith(
      'cost_centers',
      'cost2',
      expect.any(Array)
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

    // INC-6700: the correction is persisted (as up to 3.6.x) so the inactive
    // record stops being selected - with the record's ids: organization
    // 'org2', b2b_users record 'u2' - and without reading a session cookie.
    expect(setActiveUserByOrganization).toHaveBeenCalledTimes(1)
    expect(setActiveUserByOrganization).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        costId: 'cost2',
        email: 'buyer@test.com',
        orgId: 'org2',
        skipSession: true,
        userId: 'u2',
      }),
      ctx
    )

    const persisted = ctx.vtex.logger.info.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'setProfile.organizationCorrectionPersisted'
    )

    expect(persisted?.[0]).toMatchObject({
      orgId: 'org2',
      unusableOrgId: 'org1',
    })
    expect(JSON.stringify(persisted?.[0])).not.toContain('buyer@test.com')

    const persistedEvent = (sendMetric as jest.Mock).mock.calls.find(
      (call: any[]) =>
        call[0]?.kind ===
        'b2b-storefront-permissions-organization-correction-persisted'
    )

    expect(JSON.stringify(persistedEvent?.[0])).not.toContain('buyer@test.com')

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.organizationRecovered'
    )

    expect(reported?.[0]).toMatchObject({
      email: '<redacted-email>',
      recoveredOrgId: 'org2',
      unusableOrgId: 'org1',
    })
    expect(JSON.stringify(reported?.[0])).not.toContain('buyer@test.com')

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

    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(response['storefront-permissions'].hash.value).toBe(
      toHash('org2|cost2b')
    )
    // The persisted correction follows the adopted pair, and drops the cache
    // entry the next transform (pinned to it) will read.
    expect(setActiveUserByOrganization).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        cacheStickies: ['org2:cost2b'],
        costId: 'cost2b',
        orgId: 'org2',
        userId: 'u2b',
      }),
      ctx
    )
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
        if (entity === 'cost_centers') {
          return Promise.resolve(costCenterDoc([defaultAddress], { id }))
        }

        if (entity !== 'organizations') {
          return Promise.resolve(undefined)
        }

        if (id === 'org1') {
          return Promise.resolve({ name: 'Inactive Org', status: 'inactive' })
        }

        if (id === 'orgSticky') {
          return Promise.resolve({
            collections: null,
            name: 'Sticky Org',
            priceTables: null,
            salesChannel: null,
            sellers: null,
            status: 'active',
            tradeName: null,
          })
        }

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
    // responses stable. Matching inputs are omitted so the session does not
    // loop on unchanged organization/cost center.
    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(response['storefront-permissions'].hash.value).toBe(
      toHash('orgSticky|costSticky')
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
        if (entity === 'cost_centers') {
          if (id === 'costGone') {
            return Promise.resolve(undefined)
          }

          return Promise.resolve(costCenterDoc([defaultAddress], { id }))
        }

        if (entity !== 'organizations') {
          return Promise.resolve(undefined)
        }

        if (id === 'org1') {
          return Promise.resolve({ name: 'Inactive Org', status: 'inactive' })
        }

        if (id === 'orgSticky') {
          return Promise.resolve({ name: 'Sticky Org', status: 'active' })
        }

        if (id === 'org2') {
          return Promise.resolve({
            collections: null,
            name: 'Recovered Org',
            priceTables: null,
            salesChannel: null,
            sellers: null,
            status: 'active',
            tradeName: null,
          })
        }

        return Promise.resolve(undefined)
      }
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
        name: 'Also Inactive',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: 'inactive',
        tradeName: null,
      },
    })

    await expect(run(ctx)).rejects.toThrow()

    const reported = ctx.vtex.logger.error.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.organizationUnavailable'
    )

    expect(reported?.[0]).toMatchObject({ reason: 'organizationNotActive' })
    // Nothing usable: nothing is persisted either.
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
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

    expect(first['storefront-permissions'].organization).toBeUndefined()

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

    expect(response['storefront-permissions'].organization).toBeUndefined()
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

    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(response['storefront-permissions'].hash.value).toBe(
      toHash('org2|costB')
    )
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

    expect(response['storefront-permissions'].organization).toBeUndefined()
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

  it('omits pinned B2B fields when the shopper has no Master Data record (Okta-only)', async () => {
    const ctx = makeCtx({ userDocs: [] })

    const body = {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: '0000001322-cc' },
        hash: { value: 'stale-hash' },
        organization: { value: '0000001322' },
      },
    }

    const response = await run(ctx, body)

    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(response['storefront-permissions'].hash).toBeUndefined()
    expect(
      response['storefront-permissions'].costCenterAddressId
    ).toBeUndefined()

    const userNotFound = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.message === 'getActiveUserByEmail-userNotFound'
    )

    expect(userNotFound).toBeDefined()

    const stickyGone = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'getActiveUserByEmail-stickyOrgNoLongerAvailable'
    )

    expect(stickyGone?.[0]).toMatchObject({ stickyOrgId: '0000001322' })

    const b2bNotFound = ctx.vtex.logger.error.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.b2bUserNotFound'
    )

    expect(b2bNotFound?.[0]).toMatchObject({
      email: '<redacted-email>',
      stickyOrgId: '0000001322',
    })
    expect(JSON.stringify(b2bNotFound?.[0])).not.toContain('buyer@test.com')
  })

  it('returns the same omitted pin fields on consecutive transforms (no empty-string flip)', async () => {
    const ctx = makeCtx({ userDocs: [] })
    const body = {
      ...makeBody(),
      'storefront-permissions': {
        costcenter: { value: '0000001322-cc' },
        hash: { value: '' },
        organization: { value: '0000001322' },
      },
    }

    const first = await run(ctx, body)
    const second = await run(ctx, body)

    const pinSnapshot = (response: any) =>
      JSON.stringify({
        costcenter: response['storefront-permissions']?.costcenter,
        costCenterAddressId:
          response['storefront-permissions']?.costCenterAddressId,
        hash: response['storefront-permissions']?.hash,
        organization: response['storefront-permissions']?.organization,
      })

    expect(pinSnapshot(first)).toBe(pinSnapshot(second))
    expect(pinSnapshot(first)).toBe(
      JSON.stringify({
        costcenter: undefined,
        costCenterAddressId: undefined,
        hash: undefined,
        organization: undefined,
      })
    )
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
      email: '<redacted-email>',
      organizationId: 'org1',
      reason: 'organizationNotFound',
    })
    expect(JSON.stringify(reported?.[0])).not.toContain('buyer@test.com')
  })

  it('serves an on-hold organization, as in 3.6.x (INC-6700)', async () => {
    // Only 'inactive' blocks the session; 'on-hold' is served as it was up to
    // 3.6.x, with no recovery and nothing persisted.
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

    expect(response['storefront-permissions'].organization.value).toBe('org1')
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
    expect(
      ctx.vtex.logger.warn.mock.calls.some(
        (call: any[]) => call[0]?.message === 'setProfile.organizationRecovered'
      )
    ).toBe(false)
  })

  it('serves an organization with no status at all', async () => {
    const ctx = makeCtx({
      organization: {
        collections: null,
        name: 'No Status Org',
        priceTables: null,
        salesChannel: null,
        sellers: null,
        status: null,
        tradeName: null,
      },
    })

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org1')
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

    // Served (only 'inactive' blocks), but reported so it gets looked at.
    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org1')

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

    const sent = ctx.clients.checkout.updateOrderFormShipping.mock.calls[0]?.[1]

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
    const sent = ctx.clients.checkout.updateOrderFormShipping.mock.calls[0]?.[1]

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
      costCenterAddresses: [{ ...defaultAddress, reference: 'has "quotes"' }],
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
      (call: any[]) => call[0]?.['setProfile.body']
    )

    expect(quietPayloads).toHaveLength(0)

    // Defer-region publishes postalCode/country on the response so the
    // redaction assertion below has locality values to refuse.
    const verbose = makeCtx({
      appSettings: {
        deferRegionToCheckoutSession: true,
        logSessionPayloads: true,
      },
      costCenterAddresses: [{ ...defaultAddress, postalCode: '90210' }],
    })

    await run(verbose, {
      ...makeBody(),
      authentication: { storeUserEmail: { value: 'buyer@secret.com' } },
    })

    const verbosePayloads = verbose.vtex.logger.info.mock.calls.filter(
      (call: any[]) => call[0]?.['setProfile.body']
    )

    expect(verbosePayloads).toHaveLength(1)

    const logged = JSON.stringify(verbosePayloads[0][0])

    expect(logged).not.toContain('buyer@secret.com')
    expect(logged).not.toContain('90210')
    expect(logged).toContain('<redacted-email>')
    expect(logged).toContain('<redacted>')
  })

  it('reuses the active-user lookup across runs and refetches when the cost center changes', async () => {
    // One ctx for all runs: the caches are account-scoped module singletons,
    // and this test is about sharing them across requests.
    const ctx = makeCtx()
    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    await run(ctx)
    // One resolution = one Master Data call (the result fits in a single page).
    expect(lookups).toHaveBeenCalledTimes(1)

    await run(ctx)
    // Same email, same cost center: served from cache, no new lookup.
    expect(lookups).toHaveBeenCalledTimes(1)

    await run(ctx, {
      ...makeBody(),
      public: { b2bCurrentCostCenter: { value: 'cost2' } },
    })
    // setCurrentOrganization writes b2bCurrentCostCenter on an organization
    // switch; a different value must change the key and force a fresh lookup:
    // the active search, plus the direct read of the requested record (this
    // shopper holds no 'cost2', so the active record stands).
    expect(lookups).toHaveBeenCalledTimes(3)
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

/**
 * The session learns which organization a shopper is in by searching
 * `b2b_users` for `active = true`, and that search trails writes. The switch
 * already knows the answer, so it records it under the shopper's key and the
 * transform reads it by document id - no index on either hop.
 */
describe('setProfile resolving the active user from the recorded selection', () => {
  const withSelection = (ctx: any, selection: any) => {
    ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
      (entity: string, id: string, fields: string[]) => {
        if (entity === 'b2b_user_selection') {
          return Promise.resolve(selection)
        }

        return Promise.resolve(
          entity === 'organizations' && id === 'org1'
            ? { name: 'Test Org', salesChannel: null, status: 'active' }
            : costCenterDoc(undefined, { id })
        )
      }
    )
  }

  const bodyWithUser = () => ({
    ...makeBody(),
    authentication: {
      storeUserEmail: { value: 'buyer@test.com' },
      storeUserId: { value: 'shopper-1' },
    },
  })

  it('reads the recorded selection instead of searching for the active record', async () => {
    const ctx = makeCtx()

    withSelection(ctx, { b2bUserId: 'u1', costId: 'cost1', orgId: 'org1' })

    const response = await run(ctx, bodyWithUser())

    expect(response['storefront-permissions'].organization.value).toBe('org1')
    expect(ctx.clients.masterdata.getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' })
    )
    // The whole point: the active-record search never runs.
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).not.toHaveBeenCalled()
  })

  /**
   * A shopper who has never switched has no selection, and Master Data
   * answers that with an empty body rather than an error. The search still
   * has to carry them.
   */
  it('falls back to the search when nothing was ever recorded', async () => {
    const ctx = makeCtx()

    withSelection(ctx, '')

    const response = await run(ctx, bodyWithUser())

    expect(response['storefront-permissions'].organization.value).toBe('org1')
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalled()
  })

  /**
   * The selection points at a record, not at an organization. If that record
   * has since lost its organization the selection is unusable, and the search
   * - which is still the durable truth - has to answer.
   */
  it('falls back to the search when the recorded record no longer names an organization', async () => {
    const ctx = makeCtx()

    withSelection(ctx, { b2bUserId: 'gone', costId: 'cost1', orgId: 'org1' })

    await run(ctx, bodyWithUser())

    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalled()
  })

  it('does not look for a selection when the session names no shopper', async () => {
    const ctx = makeCtx()

    withSelection(ctx, { b2bUserId: 'u1', costId: 'cost1', orgId: 'org1' })

    await run(ctx, makeBody())

    const askedForSelection =
      ctx.clients.masterDataExtended.getDocumentById.mock.calls.some(
        (call: any[]) => call[0] === 'b2b_user_selection'
      )

    expect(askedForSelection).toBe(false)
  })
})

/**
 * INC-6700: with a 1.x major installed next to 3.x, vtex.session builds the
 * transform input from the 1.x declaration - no `authentication.storeUserId`
 * (so no selection read) and no session pin. `public.b2bCurrentCostCenter` is
 * the one signal of a switch that still arrives, and the search on `active`
 * trails the switch's writes.
 */
describe('setProfile after an organization switch (INC-6700)', () => {
  const activeOrg = {
    collections: null,
    name: 'Org',
    priceTables: null,
    salesChannel: null,
    sellers: null,
    status: 'active',
    tradeName: null,
  }

  // The index still reports the record the shopper left as the active one.
  const laggedDocs = () => [
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
      clId: 'cl2',
      costId: 'cost2',
      email: 'buyer@test.com',
      id: 'u2',
      name: 'Buyer',
      orgId: 'org2',
    },
  ]

  const switchedBody = (
    costId: string,
    extra: Record<string, unknown> = {}
  ) => ({
    ...makeBody(),
    public: { b2bCurrentCostCenter: { value: costId } },
    ...extra,
  })

  it('resolves the switch target by email and cost center without a selection or pin (1.x input)', async () => {
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs: laggedDocs(),
    })

    const response = await run(ctx, switchedBody('cost2'))

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].costcenter.value).toBe('cost2')
    expect(response['storefront-permissions'].userId.value).toBe('u2')
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: 'email=buyer@test.com AND costId=cost2',
      })
    )
    expect(
      ctx.vtex.logger.warn.mock.calls.some(
        (call: any[]) => call[0]?.message === 'setProfile.costCenterMismatch'
      )
    ).toBe(false)
  })

  it('prefers the switch target over a selection that still names the previous cost center', async () => {
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs: laggedDocs(),
    })

    ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
      (entity: string, id: string) => {
        if (entity === 'b2b_user_selection') {
          return Promise.resolve({
            b2bUserId: 'u1',
            costId: 'cost1',
            orgId: 'org1',
          })
        }

        if (entity === 'organizations') {
          return Promise.resolve(activeOrg)
        }

        return Promise.resolve(costCenterDoc(undefined, { id }))
      }
    )

    const response = await run(
      ctx,
      switchedBody('cost2', {
        authentication: {
          storeUserEmail: { value: 'buyer@test.com' },
          storeUserId: { value: 'shopper-1' },
        },
      })
    )

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].userId.value).toBe('u2')
  })

  it('keeps the resolved record when the requested cost center is not one the shopper holds', async () => {
    const ctx = makeCtx({ organization: activeOrg, userDocs: laggedDocs() })

    const response = await run(ctx, switchedBody('someone-elses-cost'))

    expect(response['storefront-permissions'].organization.value).toBe('org1')

    const mismatch = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.costCenterMismatch'
    )

    expect(mismatch?.[0]).toMatchObject({
      requestedCostId: 'someone-elses-cost',
      resolvedCostId: 'cost1',
    })
    expect(JSON.stringify(mismatch?.[0])).not.toContain('buyer@test.com')
  })

  it('never puts a malformed requested cost center into a Master Data query', async () => {
    const ctx = makeCtx({ organization: activeOrg, userDocs: laggedDocs() })

    const response = await run(ctx, switchedBody('x OR email=other@test.com'))

    expect(response['storefront-permissions'].organization.value).toBe('org1')

    const queries =
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo.mock.calls.map(
        (call: any[]) => call[0]?.where
      )

    expect(queries.some((where: string) => where.includes('other@'))).toBe(
      false
    )
  })

  it('treats a cached entry for another cost center as a miss', async () => {
    const userDocs: any[] = laggedDocs().slice(0, 1)
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs,
    })

    // First transform after the switch: the target record is not readable
    // yet, so the previous record is resolved - and cached under the key of
    // the requested cost center.
    const first = await run(ctx, switchedBody('cost2'))

    expect(first['storefront-permissions'].organization.value).toBe('org1')

    // The record becomes readable. The cached entry must not win.
    userDocs.push(laggedDocs()[1])

    const second = await run(ctx, switchedBody('cost2'))

    expect(second['storefront-permissions'].organization.value).toBe('org2')

    const bypass = (sendMetric as jest.Mock).mock.calls.find(
      (call: any[]) =>
        call[0]?.kind ===
        'b2b-storefront-permissions-active-user-cache-bypass-read'
    )

    expect(bypass?.[0].fields).toMatchObject({
      reason: 'cachedCostCenterMismatch',
      requestedCostId: 'cost2',
    })
  })

  it('still serves a cached entry that matches the requested cost center', async () => {
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs: laggedDocs(),
    })

    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo

    await run(ctx, switchedBody('cost2'))
    const callsAfterFirst = lookups.mock.calls.length

    await run(ctx, switchedBody('cost2'))

    expect(lookups.mock.calls).toHaveLength(callsAfterFirst)
  })

  it('does not persist a correction away from the cost center the shopper switched to', async () => {
    // The switch target itself is inactive (setCurrentOrganization does not
    // validate status). The response recovers, but writing the correction
    // would be undone by the request on every transform.
    ;(getUserOrganizationsData as jest.Mock).mockResolvedValue({
      activeOrganization: { costId: 'cost1', id: 'u1', orgId: 'org1' },
      validCostCenterId: null,
    })

    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: { ...activeOrg, status: 'inactive' },
      userDocs: laggedDocs(),
    })

    // org2 is inactive, org1 active: swap the document lookup accordingly.
    ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
      (entity: string, id: string) => {
        if (entity === 'organizations') {
          return Promise.resolve(
            id === 'org2' ? { ...activeOrg, status: 'inactive' } : activeOrg
          )
        }

        return Promise.resolve(
          entity === 'cost_centers'
            ? costCenterDoc(undefined, { id })
            : undefined
        )
      }
    )

    const response = await run(ctx, switchedBody('cost2'))

    expect(response['storefront-permissions'].organization.value).toBe('org1')
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
  })
})

/**
 * INC-6700 (retest RISK 2): the organization cache can trail a status change.
 * Now that the recovery persists its correction, an 'inactive' served from
 * cache is confirmed against Master Data before anything is written.
 */
describe('setProfile confirming an inactive status before correcting (INC-6700)', () => {
  const inactiveOrg = {
    collections: null,
    name: 'Org 1',
    priceTables: null,
    salesChannel: null,
    sellers: null,
    status: 'inactive',
    tradeName: null,
  }

  const activeOrg = { ...inactiveOrg, name: 'Org 2', status: 'active' }

  const org1Reads = (ctx: any) =>
    ctx.clients.masterDataExtended.getDocumentById.mock.calls.filter(
      (call: any[]) => call[0] === 'organizations' && call[1] === 'org1'
    ).length

  /** org1 reads answer `first` once (the cached read), then `fresh`. */
  const withOrg1Reads = (ctx: any, first: any, fresh: () => Promise<any>) => {
    const original =
      ctx.clients.masterDataExtended.getDocumentById.getMockImplementation()

    let served = 0

    ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
      (entity: string, id: string, fields: string[]) => {
        if (entity === 'organizations' && id === 'org1') {
          served += 1

          return served === 1 ? Promise.resolve(first) : fresh()
        }

        return original(entity, id, fields)
      }
    )
  }

  beforeEach(() => {
    ;(getUserOrganizationsData as jest.Mock).mockResolvedValue({
      activeOrganization: { costId: 'cost2', id: 'u2', orgId: 'org2' },
      validCostCenterId: null,
    })
  })

  it('serves the organization and persists nothing when Master Data says it is active again', async () => {
    const ctx = makeCtx({ recoveredOrganization: activeOrg })

    withOrg1Reads(ctx, inactiveOrg, () =>
      Promise.resolve({ ...inactiveOrg, status: 'active' })
    )

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org1')
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
    expect(org1Reads(ctx)).toBe(2)

    const stale = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.message === 'setProfile.organizationStatusStale'
    )

    expect(stale?.[0]).toMatchObject({
      cachedStatus: 'inactive',
      correctionSkipped: true,
      freshStatus: 'active',
      organizationId: 'org1',
    })
    expect(JSON.stringify(stale?.[0])).not.toContain('buyer@test.com')

    const event = (sendMetric as jest.Mock).mock.calls.find(
      (call: any[]) =>
        call[0]?.kind === 'b2b-storefront-permissions-organization-status-stale'
    )

    expect(event?.[0].fields).toMatchObject({ organizationId: 'org1' })
    expect(JSON.stringify(event?.[0])).not.toContain('buyer@test.com')

    // The fresh read refreshed the cache: the next transform is served the
    // active document without another Master Data read or recovery.
    const again = await run(ctx)

    expect(again['storefront-permissions'].hash.value).toBe(
      toHash('org1|cost1')
    )
    expect(org1Reads(ctx)).toBe(2)
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
  })

  it('persists the correction once Master Data confirms the organization is inactive', async () => {
    const ctx = makeCtx({
      organization: inactiveOrg,
      recoveredOrganization: activeOrg,
    })

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    // The cached read and the confirmation.
    expect(org1Reads(ctx)).toBe(2)
    expect(setActiveUserByOrganization).toHaveBeenCalledTimes(1)
  })

  it('recovers this response but writes nothing when the confirmation fails', async () => {
    const ctx = makeCtx({ recoveredOrganization: activeOrg })

    withOrg1Reads(ctx, inactiveOrg, () =>
      Promise.reject(Object.assign(new Error('timeout'), { status: 500 }))
    )

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
    expect(ctx.vtex.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'setProfile.organizationCorrectionSkipped',
        reason: 'statusNotConfirmed',
        unusableOrgId: 'org1',
      })
    )
  })

  it('treats an organization deleted since it was cached as missing (no correction)', async () => {
    const ctx = makeCtx({ recoveredOrganization: activeOrg })

    withOrg1Reads(ctx, inactiveOrg, () => Promise.resolve(undefined))

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(setActiveUserByOrganization).not.toHaveBeenCalled()
  })

  it('does not re-read an organization that is not inactive', async () => {
    const ctx = makeCtx()

    await run(ctx)

    expect(org1Reads(ctx)).toBe(1)
  })
})

/**
 * INC-6700 (retest p2b): a NEW session (no b2bCurrentCostCenter) right after a
 * switch was served the cached `email|default|none` entry - the organization
 * the shopper left - for up to the cache TTL, because a switch could only drop
 * that entry from the memory of the pod that ran it.
 */
describe('setProfile for a new session after a switch (INC-6700)', () => {
  const activeOrg = {
    collections: null,
    name: 'Org',
    priceTables: null,
    salesChannel: null,
    sellers: null,
    status: 'active',
    tradeName: null,
  }

  const docs = (u1Active: boolean, u2Active: boolean) => [
    {
      active: u1Active,
      clId: 'cl1',
      costId: 'cost1',
      email: 'buyer@test.com',
      id: 'u1',
      name: 'Buyer',
      orgId: 'org1',
    },
    {
      active: u2Active,
      clId: 'cl2',
      costId: 'cost2',
      email: 'buyer@test.com',
      id: 'u2',
      name: 'Buyer',
      orgId: 'org2',
    },
  ]

  /** Serves `marker()` for the switch-marker file, the defaults otherwise. */
  const withMarker = (ctx: any, marker: () => any) => {
    const original = ctx.clients.vbase.getJSON.getMockImplementation()

    ctx.clients.vbase.getJSON.mockImplementation(
      (bucket: string, file: string, nullIfNotFound: boolean) =>
        String(file).startsWith('active-switch-')
          ? Promise.resolve(marker())
          : original(bucket, file, nullIfNotFound)
    )
  }

  const switchTo = (userDocs: any[], id: string) => {
    userDocs.forEach((doc) => {
      doc.active = doc.id === id
    })
  }

  const bypassReasons = () =>
    (sendMetric as jest.Mock).mock.calls
      .filter(
        (call: any[]) =>
          call[0]?.kind ===
          'b2b-storefront-permissions-active-user-cache-bypass-read'
      )
      .map((call: any[]) => call[0].fields.reason)

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('refuses a cached entry older than the switch marker, on the very first read', async () => {
    const userDocs = docs(true, false)
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs,
    })

    let marker: any = null

    withMarker(ctx, () => marker)

    // A session before the switch caches org1 under email|default|none.
    expect((await run(ctx))['storefront-permissions'].organization.value).toBe(
      'org1'
    )

    // Switch made elsewhere (another pod): records flipped, marker written.
    switchTo(userDocs, 'u2')
    marker = {
      at: Date.now() + 1,
      b2bUserId: 'u2',
      costId: 'cost2',
      orgId: 'org2',
    }

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(response['storefront-permissions'].userId.value).toBe('u2')
    expect(bypassReasons()).toContain('switchMarkerNewer')
  })

  it('keeps serving a cached entry newer than the marker', async () => {
    const ctx = makeCtx({
      organization: activeOrg,
      userDocs: docs(true, false),
    })

    withMarker(ctx, () => ({
      at: Date.now() - 60000,
      b2bUserId: 'u2',
      costId: 'cost2',
      orgId: 'org2',
    }))

    // The marker names u2, but u2 is no longer active: the search answers.
    await run(ctx)

    const lookups = ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    const searchesAfterFirst = lookups.mock.calls.length

    const response = await run(ctx)

    expect(response['storefront-permissions'].hash.value).toBe(
      toHash('org1|cost1')
    )
    expect(lookups.mock.calls).toHaveLength(searchesAfterFirst)
    expect(bypassReasons()).toEqual([])
  })

  it('resolves a miss from the marker, without the search index, when the session has no storeUserId', async () => {
    // Index lag: both records still read as active, and the search would pick
    // the lowest id (u1). The marker names u2, which a read by id confirms.
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs: docs(true, true),
    })

    withMarker(ctx, () => ({
      at: Date.now(),
      b2bUserId: 'u2',
      costId: 'cost2',
      orgId: 'org2',
    }))

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(
      ctx.clients.masterdata.searchDocumentsWithPaginationInfo
    ).not.toHaveBeenCalled()
  })

  it('ignores a marker whose record is no longer active (switched outside this app)', async () => {
    const ctx = makeCtx({
      organization: activeOrg,
      userDocs: docs(true, false),
    })

    withMarker(ctx, () => ({
      at: Date.now(),
      b2bUserId: 'u2',
      costId: 'cost2',
      orgId: 'org2',
    }))

    const response = await run(ctx)

    expect(response['storefront-permissions'].organization.value).toBe('org1')
  })

  it('lets the newer of the selection and the marker win', async () => {
    const run2 = async (selectionAt: number, markerAt: number) => {
      const ctx = makeCtx({
        organization: activeOrg,
        recoveredOrganization: activeOrg,
        userDocs: docs(true, true),
      })

      withMarker(ctx, () => ({
        at: markerAt,
        b2bUserId: 'u2',
        costId: 'cost2',
        orgId: 'org2',
      }))

      const original =
        ctx.clients.masterDataExtended.getDocumentById.getMockImplementation()

      ctx.clients.masterDataExtended.getDocumentById.mockImplementation(
        (entity: string, id: string, fields: string[]) =>
          entity === 'b2b_user_selection'
            ? Promise.resolve({
                b2bUserId: 'u1',
                costId: 'cost1',
                orgId: 'org1',
                updatedAt: new Date(selectionAt).toISOString(),
              })
            : original(entity, id, fields)
      )

      const response = await run(ctx, {
        ...makeBody(),
        authentication: {
          storeUserEmail: { value: 'buyer@test.com' },
          storeUserId: { value: 'shopper-1' },
        },
      })

      return response['storefront-permissions'].organization.value
    }

    const now = Date.now()

    expect(await run2(now - 5000, now)).toBe('org2')
    expect(await run2(now, now - 5000)).toBe('org1')
  })

  it('re-reads an older cached record by id and refetches when it was deactivated (1.x switch)', async () => {
    const userDocs = docs(true, false)
    const ctx = makeCtx({
      organization: activeOrg,
      recoveredOrganization: activeOrg,
      userDocs,
    })

    const start = Date.now()

    await run(ctx)

    // A 1.x switch: records flipped in Master Data, no marker written.
    switchTo(userDocs, 'u2')

    // Within the recheck window the entry is trusted without any read.
    const reads = ctx.clients.masterdata.getDocument

    reads.mockClear()
    jest.spyOn(Date, 'now').mockReturnValue(start + 10 * 1000)
    expect((await run(ctx))['storefront-permissions'].hash.value).toBe(
      toHash('org1|cost1')
    )
    expect(reads).not.toHaveBeenCalled()

    // Past it, the record is re-read by id, found inactive, and refetched.
    ;(Date.now as jest.Mock).mockReturnValue(start + 40 * 1000)

    const response = await run(ctx)

    expect(reads).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }))
    expect(response['storefront-permissions'].organization.value).toBe('org2')
    expect(bypassReasons()).toContain('cachedRecordInactive')
  })

  it('does not consult the marker for a session that asks for a cost center', async () => {
    const ctx = makeCtx({
      organization: activeOrg,
      userDocs: docs(true, false),
    })

    const body = {
      ...makeBody(),
      public: { b2bCurrentCostCenter: { value: 'cost1' } },
    }

    await run(ctx, body)
    ctx.clients.vbase.getJSON.mockClear()
    await run(ctx, body)

    const markerReads = ctx.clients.vbase.getJSON.mock.calls.filter(
      (call: any[]) => String(call[1]).startsWith('active-switch-')
    )

    expect(markerReads).toHaveLength(0)
  })
})
