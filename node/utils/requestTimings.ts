import type { Logger } from '@vtex/api/lib/service/logger/logger'

export interface RequestTimings {
  [step: string]: number
}

export interface TimerMeta {
  extra?: Record<string, unknown>
  sampleRate?: number
  slowThresholdMs?: number
}

export interface Timer {
  /** Filled in by the handler once it knows the account's settings. */
  meta: TimerMeta
  timings: RequestTimings
  totalMs: () => number
  track: <T>(step: string, promise: Promise<T>) => Promise<T>
}

export const DEFAULT_SLOW_THRESHOLD_MS = 1000

/**
 * Collects per-step durations in memory with negligible overhead (two
 * Date.now() calls per step) so they can be emitted as a single structured log
 * line at the end of the request. Deliberately does not log per step: this runs
 * on every session transform, so one line per call is the only viable volume.
 */
export const createTimer = (): Timer => {
  const startedAt = Date.now()
  const timings: RequestTimings = {}

  const track = async <T>(step: string, promise: Promise<T>): Promise<T> => {
    const stepStartedAt = Date.now()

    try {
      return await promise
    } finally {
      timings[step] = Date.now() - stepStartedAt
    }
  }

  return {
    meta: {},
    timings,
    totalMs: () => Date.now() - startedAt,
    track,
  }
}

/**
 * Lets the surrounding middleware own the timer while the handler still records
 * into it, so timings are emitted even when the handler throws before reaching
 * its final statement. Keyed weakly by the request context, so entries disappear
 * with the request.
 */
const timers = new WeakMap<object, Timer>()

export const attachTimer = (ctx: object, timer: Timer) => {
  timers.set(ctx, timer)
}

export const getTimer = (ctx: object): Timer | undefined => timers.get(ctx)

export interface LogRequestTimingsArgs {
  extra?: Record<string, unknown>
  logger: Logger
  message: string
  /** 0..1 fraction of non-slow requests to log, for baseline visibility. */
  sampleRate?: number
  slowThresholdMs?: number
  timer: Timer
}

/**
 * Emits the collected timings, but only when the request was slow (logged as
 * `warn`) or when it falls into the sample (logged as `info`). This keeps the
 * signal useful for diagnosing any account without flooding the log pipeline.
 */
export const logRequestTimings = ({
  extra,
  logger,
  message,
  sampleRate,
  slowThresholdMs,
  timer,
}: LogRequestTimingsArgs) => {
  const totalMs = timer.totalMs()
  const threshold = slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS
  const isSlow = totalMs >= threshold

  if (!isSlow && !(Math.random() < (sampleRate ?? 0))) {
    return
  }

  const steps = Object.keys(timer.timings)

  const slowestStep = steps.reduce(
    (slowest, step) =>
      timer.timings[step] > (timer.timings[slowest] ?? -1) ? step : slowest,
    steps[0] ?? ''
  )

  const payload = {
    message,
    slowestStep,
    slowestStepMs: timer.timings[slowestStep] ?? 0,
    timings: timer.timings,
    totalMs,
    ...extra,
  }

  if (isSlow) {
    logger.warn(payload)
  } else {
    logger.info(payload)
  }
}
