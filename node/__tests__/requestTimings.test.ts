import {
  attachTimer,
  createTimer,
  getTimer,
  logRequestTimings,
} from '../utils/requestTimings'

const makeLogger = () =>
  ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() } as any)

describe('createTimer', () => {
  it('records the duration of tracked promises, including failed ones', async () => {
    const timer = createTimer()

    await timer.track('ok', Promise.resolve('x'))
    await expect(
      timer.track('boom', Promise.reject(new Error('nope')))
    ).rejects.toThrow('nope')

    expect(timer.timings.ok).toBeGreaterThanOrEqual(0)
    expect(timer.timings.boom).toBeGreaterThanOrEqual(0)
    expect(timer.totalMs()).toBeGreaterThanOrEqual(0)
  })

  it('is retrievable through the request-context WeakMap', () => {
    const ctx = {}
    const timer = createTimer()

    attachTimer(ctx, timer)
    expect(getTimer(ctx)).toBe(timer)
    expect(getTimer({})).toBeUndefined()
  })
})

describe('logRequestTimings', () => {
  it('logs a warn when the request is slow', async () => {
    const timer = createTimer()

    await timer.track('slowStep', Promise.resolve(1))
    timer.timings.slowStep = 800
    timer.timings.fastStep = 5

    const logger = makeLogger()

    logRequestTimings({
      logger,
      message: 'test.timings',
      slowThresholdMs: 0,
      timer,
    })

    expect(logger.warn).toHaveBeenCalledTimes(1)
    const payload = logger.warn.mock.calls[0][0]

    expect(payload.message).toBe('test.timings')
    expect(payload.slowestStep).toBe('slowStep')
    expect(payload.slowestStepMs).toBe(800)
    expect(payload.timings).toEqual({ fastStep: 5, slowStep: 800 })
  })

  it('stays silent for fast requests when not sampled', () => {
    const logger = makeLogger()

    logRequestTimings({
      logger,
      message: 'test.timings',
      slowThresholdMs: 60000,
      timer: createTimer(),
    })

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('logs an info when sampled, even if fast', () => {
    const logger = makeLogger()

    logRequestTimings({
      logger,
      message: 'test.timings',
      sampleRate: 1,
      slowThresholdMs: 60000,
      timer: createTimer(),
    })

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('spreads extra context into the payload', () => {
    const logger = makeLogger()

    logRequestTimings({
      extra: { failed: true, orgId: 'org1' },
      logger,
      message: 'test.timings',
      slowThresholdMs: 0,
      timer: createTimer(),
    })

    const payload = logger.warn.mock.calls[0][0]

    expect(payload.failed).toBe(true)
    expect(payload.orgId).toBe('org1')
  })
})
