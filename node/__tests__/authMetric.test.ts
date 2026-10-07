/* eslint-disable @typescript-eslint/no-explicit-any */
import sendAuthMetric, { AuthMetric } from '../metrics/auth'
import { sendMetric } from '../clients/metrics'

jest.mock('../clients/metrics', () => ({
  B2B_METRIC_NAME: 'b2b-suite-buyerorg-data',
  sendMetric: jest.fn().mockResolvedValue(undefined),
}))

const sendMetricMock = sendMetric as jest.Mock

const logger = () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
})

describe('sendAuthMetric (B2BTEAM-3839)', () => {
  beforeEach(() => {
    sendMetricMock.mockReset()
    sendMetricMock.mockResolvedValue(undefined)
  })

  const metric = () =>
    new AuthMetric('acc', {
      caller: 'test',
      forwardedHost: 'host',
      operation: 'checkUserAccess',
      userAgent: 'jest',
    })

  it('forwards the metric to sendMetric on success', async () => {
    const log = logger()
    const authMetric = metric()

    await sendAuthMetric(log as any, authMetric)

    expect(sendMetricMock).toHaveBeenCalledWith(authMetric)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('swallows sendMetric failures without logging error', async () => {
    const log = logger()

    sendMetricMock.mockRejectedValue(new Error('analytics down'))

    await sendAuthMetric(log as any, metric())

    expect(log.error).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.info).not.toHaveBeenCalled()
    expect(log.debug).not.toHaveBeenCalled()
  })
})
