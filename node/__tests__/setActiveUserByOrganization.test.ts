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

describe('setActiveUserByOrganization', () => {
  beforeEach(() => {
    sendMetricMock.mockClear()
    getAllUsersByEmailMock.mockReset()
  })

  it('traces the Master Data fan-out: full list plus a write per other record', async () => {
    getAllUsersByEmailMock.mockResolvedValue([
      { ...targetUser, active: true, costId: 'cost1', id: 'u1', orgId: 'org1' },
      targetUser,
      {
        active: false,
        costId: 'cost3',
        email: 'buyer@test.com',
        id: 'u3',
        orgId: 'org3',
      },
    ])

    const ctx = makeCtx()

    await setActiveUserByOrganization(
      null,
      { costId: 'cost2', orgId: 'org2', userId: 'u2' },
      ctx
    )

    const reported = ctx.vtex.logger.info.mock.calls.find(
      (call: any[]) =>
        call[0]?.message === 'setActiveUserByOrganization.timings'
    )

    expect(reported?.[0]).toMatchObject({
      currentlyActiveCount: 1,
      deactivateWrites: 2,
      listedCount: 3,
      orgId: 'org2',
      searchPagesEstimate: 1,
      userId: 'u2',
    })
    expect(reported?.[0].timings).toEqual(
      expect.objectContaining({
        activate: expect.any(Number),
        deactivateOthers: expect.any(Number),
        getUser: expect.any(Number),
        listUsers: expect.any(Number),
      })
    )
    expect(
      ctx.clients.masterdata.createOrUpdateEntireDocument
    ).toHaveBeenCalledTimes(3)

    expect(sendMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'set-active-user-by-organization',
        fields: expect.objectContaining({
          currentlyActiveCount: 1,
          deactivateWrites: 2,
          listedCount: 3,
        }),
      })
    )
  })
})
