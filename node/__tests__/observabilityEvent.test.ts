import { sendMetric } from '../clients/metrics'
import { sendObservabilityEvent } from '../utils/observabilityEvent'

jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

const sendMetricMock = sendMetric as jest.Mock

const makeCtx = (): any => ({
  vtex: {
    account: 'acc',
    logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
    workspace: 'master',
  },
})

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('sendObservabilityEvent', () => {
  it('ships the event through the analytics channel with tenant context', () => {
    const ctx = makeCtx()

    sendObservabilityEvent(ctx, 'organization-recovered', {
      recoveredOrgId: 'org2',
      unusableOrgId: 'org1',
    })

    expect(sendMetricMock).toHaveBeenCalledWith({
      account: 'acc',
      description: 'organization-recovered',
      fields: {
        recoveredOrgId: 'org2',
        unusableOrgId: 'org1',
        workspace: 'master',
      },
      kind: 'b2b-storefront-permissions-organization-recovered',
      name: 'b2b-suite-buyerorg-data',
    })
  })

  it('never throws and never rejects when the channel is down', async () => {
    const ctx = makeCtx()

    sendMetricMock.mockRejectedValueOnce(new Error('ECONNRESET'))

    // Measurement must not affect the request: the failure is only logged.
    expect(() =>
      sendObservabilityEvent(ctx, 'organization-recovered', {})
    ).not.toThrow()

    await flush()

    const reported = ctx.vtex.logger.warn.mock.calls.find(
      (call: any[]) => call[0]?.message === 'observabilityEvent.sendError'
    )

    expect(reported?.[0]).toMatchObject({ event: 'organization-recovered' })
  })
})
