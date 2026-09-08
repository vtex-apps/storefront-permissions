import { sendMetric } from '../clients/metrics'
import { setActiveUserByOrganization } from '../resolvers/Mutations/Users'
import { getAllUsersByEmail } from '../resolvers/Queries/Users'

jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../resolvers/Queries/Users', () => ({
  getAllUsersByEmail: jest.fn(),
  getOrganizationsByEmail: jest.fn(),
  getUserByEmailOrgIdAndCostId: jest.fn(),
}))

const sendMetricMock = sendMetric as jest.Mock
const getAllUsersByEmailMock = getAllUsersByEmail as jest.Mock

const targetUser = {
  active: false,
  costId: 'cost2',
  email: 'buyer@test.com',
  id: 'u2',
  orgId: 'org2',
}

const sibling = (id: string, active: boolean) => ({
  active,
  costId: `cost-${id}`,
  email: 'buyer@test.com',
  id,
  orgId: `org-${id}`,
})

/**
 * Stands in for Master Data: honours the `active` predicate the caller passes,
 * so a test that seeds inactive records proves they were never fetched rather
 * than merely never written.
 */
const seedRecords = (records: any[]) => {
  getAllUsersByEmailMock.mockImplementation(async (_: any, params: any) =>
    params?.active === undefined
      ? records
      : records.filter((record) => record.active === params.active)
  )
}

const makeCtx = (): any => ({
  clients: {
    masterdata: {
      createOrUpdateEntireDocument: jest
        .fn()
        .mockResolvedValue({ DocumentId: 'u2' }),
      searchDocuments: jest.fn().mockResolvedValue([targetUser]),
    },
    session: { getSession: jest.fn() },
  },
  vtex: {
    account: 'acc',
    adminUserAuthToken: 'admin-token',
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    sessionToken: null,
    workspace: 'master',
  },
})

const timingsFrom = (ctx: any) =>
  ctx.vtex.logger.info.mock.calls.find(
    (call: any[]) => call[0]?.message === 'setActiveUserByOrganization.timings'
  )?.[0]

const switchToTarget = (ctx: any) =>
  setActiveUserByOrganization(
    null,
    { costId: 'cost2', orgId: 'org2', userId: 'u2' },
    ctx
  )

describe('setActiveUserByOrganization', () => {
  beforeEach(() => {
    sendMetricMock.mockClear()
    getAllUsersByEmailMock.mockReset()
  })

  /**
   * Deactivation used to list every record for the email and rewrite each
   * sibling document, so an organization switch cost one full-document write
   * per record the shopper holds. Measured on a live account at 63-106 writes
   * per switch against one or two genuinely active records, with
   * `deactivateOthers` the slowest step in every sampled call and one reaching
   * 60s - past the CDN's 30s origin timeout, which the shopper saw as a 504.
   */
  it('asks Master Data only for the active records', async () => {
    seedRecords([
      sibling('u1', true),
      targetUser,
      ...['u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'].map((id) =>
        sibling(id, false)
      ),
    ])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    expect(getAllUsersByEmailMock).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ active: true, email: 'buyer@test.com' }),
      ctx
    )

    // One write to activate the target, one to deactivate the only active
    // sibling. The other eight are never fetched, let alone written.
    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(2)

    expect(timingsFrom(ctx)).toMatchObject({
      activeListedCount: 1,
      deactivateWrites: 1,
      orgId: 'org2',
      userId: 'u2',
    })
  })

  it('times the filtered read under its own step name', async () => {
    seedRecords([sibling('u1', true), targetUser, sibling('u3', false)])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    const reported = timingsFrom(ctx)

    expect(reported.timings).toEqual(
      expect.objectContaining({
        activate: expect.any(Number),
        deactivateOthers: expect.any(Number),
        getUser: expect.any(Number),
        listActiveUsers: expect.any(Number),
      })
    )

    // The counts that described the old full scan are gone rather than
    // silently redefined against a read that no longer happens.
    expect(reported).not.toHaveProperty('listedCount')
    expect(reported).not.toHaveProperty('currentlyActiveCount')
    expect(reported).not.toHaveProperty('searchPagesEstimate')

    expect(sendMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'set-active-user-by-organization',
        fields: expect.objectContaining({
          activeListedCount: 1,
          deactivateWrites: 1,
        }),
      })
    )
  })

  /**
   * `getActiveUserByEmail` treats "at most one active record per email" as an
   * invariant and picks the lowest id when it is broken, so a switch must clear
   * every stray active record rather than only the one it knows about.
   */
  it('deactivates every active record when more than one is active', async () => {
    seedRecords([
      sibling('u1', true),
      targetUser,
      sibling('u3', false),
      sibling('u4', true),
    ])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(3)

    expect(timingsFrom(ctx)).toMatchObject({
      activeListedCount: 2,
      deactivateWrites: 2,
    })
  })

  it('writes nothing beyond the activation when no record is active', async () => {
    seedRecords([targetUser, sibling('u3', false), sibling('u4', false)])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(1)

    expect(timingsFrom(ctx)).toMatchObject({
      activeListedCount: 0,
      deactivateWrites: 0,
    })
  })

  /**
   * The activation write lands before this read, so the target comes back in
   * the active set. It must be excluded by id - rewriting it with
   * `active: false` would undo the switch.
   *
   * The inactive sibling is what makes this discriminating: exclusion by id
   * alone behaves the same before and after the filter, so without a record
   * that only an unfiltered read would return, the assertion below holds
   * against either implementation.
   */
  it('never deactivates the record it just activated', async () => {
    seedRecords([
      { ...targetUser, active: true },
      sibling('u1', true),
      sibling('u3', false),
    ])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    const deactivated =
      ctx.clients.masterdata.createOrUpdateEntireDocument.mock.calls
        .filter((call: any[]) => call[0]?.fields?.active === false)
        .map((call: any[]) => call[0].id)

    expect(deactivated).toEqual(['u1'])
    expect(timingsFrom(ctx)).toMatchObject({
      activeListedCount: 2,
      deactivateWrites: 1,
    })
  })
})
