/* eslint-disable @typescript-eslint/no-explicit-any */
import { setCurrentOrganization } from '../resolvers/Mutations/Users'
import { getUserByEmailOrgIdAndCostId } from '../resolvers/Queries/Users'

jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../resolvers/Queries/Users', () => ({
  getAllUsersByEmail: jest.fn(),
  getOrganizationsByEmail: jest.fn(),
  getUserByEmailOrgIdAndCostId: jest.fn(),
}))

const getUserMock = getUserByEmailOrgIdAndCostId as jest.Mock

const makeCtx = (namespaces: any) => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

  return {
    clients: {},
    cookies: { get: jest.fn().mockReturnValue('session-cookie') },
    request: { header: {} },
    vtex: {
      account: 'testacc',
      logger,
      sessionData: namespaces === null ? null : { namespaces },
    },
  } as any
}

const noSessionEmailLog = (ctx: any) =>
  ctx.vtex.logger.warn.mock.calls.find(
    (call: any[]) =>
      call[0]?.message === 'setCurrentOrganization.error.noSessionEmail'
  )?.[0]

const params = { costId: 'cost1', orgId: 'org1' }

/**
 * The sold-to switch runs against the session B2BTEAM-3852 is about. When the
 * transform returns early without an email, `namespaces.profile` is absent,
 * and the bare destructure this replaced threw `Cannot read properties of
 * undefined (reading 'profile')` - aborting the switch with a stack trace that
 * named no organization, no cost center and no namespace. Observed on live
 * traffic immediately after the empty transform.
 */
describe('setCurrentOrganization with an incomplete session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('answers with an error instead of throwing when the profile namespace is missing', async () => {
    const ctx = makeCtx({ 'storefront-permissions': {} })

    const result = await setCurrentOrganization(null, params, ctx)

    expect(result.status).toBe('error')
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('answers with an error when there is no session at all', async () => {
    const ctx = makeCtx(null)

    const result = await setCurrentOrganization(null, params, ctx)

    expect(result.status).toBe('error')
  })

  it('answers with an error when the profile carries no email value', async () => {
    const ctx = makeCtx({ profile: { email: {} } })

    const result = await setCurrentOrganization(null, params, ctx)

    expect(result.status).toBe('error')
  })

  /**
   * The point of the guard is not merely to avoid the crash: it is to say
   * which namespaces did arrive, so the switch failure can be matched against
   * the transform's own `earlyReturn` in the same window.
   */
  it('reports which namespaces the session did carry', async () => {
    const ctx = makeCtx({
      'storefront-permissions': {},
      public: {},
    })

    await setCurrentOrganization(null, params, ctx)

    expect(noSessionEmailLog(ctx)).toMatchObject({
      costId: 'cost1',
      hasSessionData: true,
      orgId: 'org1',
    })
    expect(noSessionEmailLog(ctx).sessionNamespaces).toEqual(
      expect.arrayContaining(['storefront-permissions', 'public'])
    )
  })

  it('distinguishes a missing namespace from a missing session', async () => {
    const ctx = makeCtx(null)

    await setCurrentOrganization(null, params, ctx)

    expect(noSessionEmailLog(ctx)).toMatchObject({
      hasSessionData: false,
      sessionNamespaces: [],
    })
  })

  it('proceeds normally when the profile email is present', async () => {
    const ctx = makeCtx({
      profile: { email: { value: 'buyer@test.com' } },
    })

    getUserMock.mockResolvedValue(null)

    await setCurrentOrganization(null, params, ctx)

    expect(getUserMock).toHaveBeenCalledWith(
      null,
      { costId: 'cost1', email: 'buyer@test.com', orgId: 'org1' },
      ctx
    )
    expect(noSessionEmailLog(ctx)).toBeUndefined()
  })
})
