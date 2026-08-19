import { withRequestTimings } from '../middlewares/withRequestTimings'
import { getTimer } from '../utils/requestTimings'

const makeCtx = () =>
  ({
    vtex: {
      account: 'acc',
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      workspace: 'master',
    },
  } as any)

describe('withRequestTimings', () => {
  it('attaches a timer the handler can retrieve', async () => {
    const ctx = makeCtx()
    let seen: unknown

    await withRequestTimings('t')(ctx, async () => {
      seen = getTimer(ctx)
    })

    expect(seen).toBeDefined()
  })

  it('stays silent on fast successful requests', async () => {
    const ctx = makeCtx()

    await withRequestTimings('t')(ctx, async () => undefined)

    expect(ctx.vtex.logger.warn).not.toHaveBeenCalled()
  })

  it('logs on success when the handler lowers the threshold', async () => {
    const ctx = makeCtx()

    await withRequestTimings('t')(ctx, async () => {
      const timer = getTimer(ctx)

      if (timer) {
        timer.meta.slowThresholdMs = 0
        timer.meta.extra = { orgId: 'org1' }
      }
    })

    expect(ctx.vtex.logger.warn).toHaveBeenCalledTimes(1)
    expect(ctx.vtex.logger.warn.mock.calls[0][0].orgId).toBe('org1')
  })

  it('always logs a failure and rethrows, regardless of threshold', async () => {
    const ctx = makeCtx()

    await expect(
      withRequestTimings('t')(ctx, async () => {
        const timer = getTimer(ctx)

        if (timer) {
          // Even an account configured to stay quiet must report failures.
          timer.meta.slowThresholdMs = 60000
          timer.meta.extra = { orgId: 'org1' }
        }

        throw new Error('handler exploded')
      })
    ).rejects.toThrow('handler exploded')

    expect(ctx.vtex.logger.warn).toHaveBeenCalledTimes(1)
    const payload = ctx.vtex.logger.warn.mock.calls[0][0]

    expect(payload.failed).toBe(true)
    expect(payload.orgId).toBe('org1')
  })
})
