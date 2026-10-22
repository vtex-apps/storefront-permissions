import { sendMetric } from '../clients/metrics'
import { setActiveUserByOrganization } from '../resolvers/Mutations/Users'
import { getAllUsersByEmail } from '../resolvers/Queries/Users'
import { invalidateActiveUserKeys } from '../services/activeUserCache'

jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../resolvers/Queries/Users', () => ({
  getAllUsersByEmail: jest.fn(),
  getOrganizationsByEmail: jest.fn(),
  getUserByEmailOrgIdAndCostId: jest.fn(),
}))

jest.mock('../services/activeUserCache', () => ({
  ...jest.requireActual('../services/activeUserCache'),
  invalidateActiveUserKeys: jest.fn().mockResolvedValue(undefined),
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
    // Where the switch is recorded for the next transform to read by id.
    masterDataExtended: {
      putDocumentById: jest.fn().mockResolvedValue(undefined),
    },
    // The admin path now loads the session too: it is the only place that
    // identifies the acting shopper, and without it an admin-assisted switch
    // records no selection. Resolves to null here, which is what a call with
    // no session cookie produces.
    session: { getSession: jest.fn().mockResolvedValue({ sessionData: null }) },
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
    ;(invalidateActiveUserKeys as jest.Mock).mockClear()
  })

  /**
   * INC-6700: the active-only search trails writes - a record activated by a
   * switch a moment ago can still be indexed as inactive, so it was skipped
   * and the shopper was left with two active records. Deactivation lists every
   * record for the email again (as up to 3.8.0) and rewrites each sibling.
   * The cost is one write per record held (measured at 63-106 per switch on a
   * live account), which is accepted in exchange for not depending on the
   * index here.
   */
  it('lists every record for the email, not only the indexed-active ones', async () => {
    seedRecords([
      sibling('u1', true),
      targetUser,
      ...['u3', 'u4', 'u5'].map((id) => sibling(id, false)),
    ])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    expect(getAllUsersByEmailMock).toHaveBeenCalledWith(
      null,
      { email: 'buyer@test.com' },
      ctx
    )
    expect(getAllUsersByEmailMock).not.toHaveBeenCalledWith(
      null,
      expect.objectContaining({ active: true }),
      ctx
    )

    // One write to activate the target, one per sibling (4).
    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(5)

    expect(timingsFrom(ctx)).toMatchObject({
      activeListedCount: 1,
      deactivateWrites: 4,
      listedCount: 5,
      orgId: 'org2',
      userId: 'u2',
    })
  })

  it('deactivates a record the index still reports as inactive', async () => {
    // u1 was activated by a switch a moment ago; the index has not caught up.
    seedRecords([sibling('u1', false), targetUser])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    const deactivated =
      ctx.clients.masterdata.createOrUpdateEntireDocument.mock.calls
        .filter((call: any[]) => call[0]?.fields?.active === false)
        .map((call: any[]) => call[0].id)

    expect(deactivated).toEqual(['u1'])
  })

  it('times the full read under its own step name and reports both counts', async () => {
    seedRecords([sibling('u1', true), targetUser, sibling('u3', false)])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    const reported = timingsFrom(ctx)

    expect(reported.timings).toEqual(
      expect.objectContaining({
        activate: expect.any(Number),
        deactivateOthers: expect.any(Number),
        getUser: expect.any(Number),
        invalidateActiveUser: expect.any(Number),
        listUsers: expect.any(Number),
      })
    )

    expect(sendMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'set-active-user-by-organization',
        fields: expect.objectContaining({
          activeListedCount: 1,
          deactivateWrites: 2,
          listedCount: 3,
        }),
      })
    )
  })

  it('writes only the activation when the target is the only record', async () => {
    seedRecords([targetUser])

    const ctx = makeCtx()

    await switchToTarget(ctx)

    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(1)

    expect(timingsFrom(ctx)).toMatchObject({
      activeListedCount: 0,
      deactivateWrites: 0,
      listedCount: 1,
    })
  })

  /**
   * The activation write lands before this read, so once the search index has
   * caught up the target comes back in the active set. It must be excluded by
   * id - rewriting it with `active: false` would undo the switch.
   */
  it('never deactivates the record it just activated', async () => {
    seedRecords([{ ...targetUser, active: true }, sibling('u1', true)])

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

describe('setActiveUserByOrganization (INC-6700)', () => {
  beforeEach(() => {
    getAllUsersByEmailMock.mockReset()
    ;(invalidateActiveUserKeys as jest.Mock).mockClear()
  })

  it('drops the active-user cache entries the next transform would read', async () => {
    seedRecords([sibling('u1', true), targetUser])

    const ctx = makeCtx()

    ctx.clients.session.getSession.mockResolvedValue({
      sessionData: {
        namespaces: {
          profile: { email: { value: 'buyer@test.com' } },
          public: { b2bCurrentCostCenter: { value: 'cost-u1' } },
          'storefront-permissions': {
            costcenter: { value: 'cost-u1' },
            organization: { value: 'org-u1' },
          },
        },
      },
    })

    await switchToTarget(ctx)

    expect(invalidateActiveUserKeys).toHaveBeenCalledTimes(1)

    const [[, emails, costCenters, stickies]] = (
      invalidateActiveUserKeys as jest.Mock
    ).mock.calls

    expect(emails).toContain('buyer@test.com')
    // The cost center switched to, and the one the session carried.
    expect(costCenters).toEqual(expect.arrayContaining(['cost2', 'cost-u1']))
    // The session pin, the organization alone, and no pin (1.x input).
    expect(stickies).toEqual(
      expect.arrayContaining(['org-u1:cost-u1', 'org-u1', null])
    )
  })

  it('still switches when the cache invalidation fails', async () => {
    seedRecords([targetUser])
    ;(invalidateActiveUserKeys as jest.Mock).mockRejectedValueOnce(
      new Error('vbase down')
    )

    const ctx = makeCtx()

    // Rejects (and fails this test) if the invalidation error escaped.
    await switchToTarget(ctx)
    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(1)
  })

  it('skips the session read and uses the given email and selection key when asked', async () => {
    seedRecords([sibling('u1', true), targetUser])

    const ctx = makeCtx()

    ctx.vtex.adminUserAuthToken = undefined

    const { getUserByEmailOrgIdAndCostId } = jest.requireMock(
      '../resolvers/Queries/Users'
    )

    getUserByEmailOrgIdAndCostId.mockResolvedValue(targetUser)

    await setActiveUserByOrganization(
      null,
      {
        costId: 'cost2',
        email: 'buyer@test.com',
        orgId: 'org2',
        selectionKey: 'shopper-1',
        skipSession: true,
        userId: 'u2',
      },
      ctx
    )

    expect(ctx.clients.session.getSession).not.toHaveBeenCalled()
    expect(getUserByEmailOrgIdAndCostId).toHaveBeenCalledWith(
      expect.anything(),
      { costId: 'cost2', email: 'buyer@test.com', orgId: 'org2' },
      ctx
    )
    expect(ctx.clients.masterDataExtended.putDocumentById).toHaveBeenCalled()
    expect(timingsFrom(ctx)).toMatchObject({
      selectionKeyResolved: true,
      selectionWritten: true,
    })
  })
})

/**
 * The timings log lists its fields explicitly, so anything set on `extra` and
 * not named there is silently dropped. That is how the selection mechanism
 * nearly shipped with no production signal at all.
 */
describe('setActiveUserByOrganization selection reporting', () => {
  const timingsLog = (ctx: any) =>
    ctx.vtex.logger.info.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'setActiveUserByOrganization.timings'
    )?.[0]

  it('reports whether the switch was recorded', async () => {
    const ctx = makeCtx()

    ctx.clients.session.getSession.mockResolvedValue({
      sessionData: {
        namespaces: { authentication: { storeUserId: { value: 'shopper-1' } } },
      },
    })

    await setActiveUserByOrganization(null, { userId: 'u2' }, ctx)

    expect(timingsLog(ctx)).toMatchObject({
      selectionKeyResolved: true,
      selectionWritten: true,
    })
  })

  /**
   * A server-to-server call carries no session, so nothing names the acting
   * shopper. The switch still succeeds; only the recording is skipped.
   */
  it('says so when the session named nobody', async () => {
    const ctx = makeCtx()

    await setActiveUserByOrganization(null, { userId: 'u2' }, ctx)

    expect(timingsLog(ctx)).toMatchObject({
      selectionKeyResolved: false,
      selectionWritten: false,
    })
  })
})
