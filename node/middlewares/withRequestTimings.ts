import { collectCacheStats } from '../services/cache'
import type { Timer } from '../utils/requestTimings'
import {
  attachTimer,
  createTimer,
  emitTimerTrace,
  logRequestTimings,
} from '../utils/requestTimings'

const CACHE_STATS_INTERVAL_MS = 5 * 60 * 1000

// Start a full interval after boot, so freshly started pods do not emit an
// empty report on their first request.
let cacheStatsLastEmittedAt = Date.now()

/**
 * Piggybacks on the hot route to report per-pod cache hit rates and sizes: one
 * `info` line per pod every five minutes, since apps here have no scheduler of
 * their own. This is what turns the LRU bounds from guesses into numbers.
 */
const maybeEmitCacheStats = (ctx: Context) => {
  const now = Date.now()

  if (now - cacheStatsLastEmittedAt < CACHE_STATS_INTERVAL_MS) {
    return
  }

  cacheStatsLastEmittedAt = now

  ctx.vtex.logger.info({
    message: 'cacheStats',
    stats: collectCacheStats(),
  })
}

/**
 * Owns the timing telemetry for a route.
 *
 * The handler cannot emit this itself on the failure path, because an exception
 * means it never reaches its final statement, and a failed request is exactly
 * when the per-step breakdown is most useful. So the timer is created here,
 * handed to the handler, and emitted from here for both outcomes:
 *
 * - success: only when slow or sampled, using the account's configured limits
 *   (unless `alwaysTrace`, used while diagnosing setProfile)
 * - failure: always, regardless of those limits
 */
export const withRequestTimings = (
  message: string,
  options: { alwaysTrace?: boolean } = {}
) =>
  // Named rather than an anonymous arrow: service-node reports per-handler
  // metrics by function name and logs an error for unnamed handlers.
  async function requestTimings(ctx: Context, next: () => Promise<void>) {
    const timer: Timer = createTimer()

    attachTimer(ctx, timer)
    maybeEmitCacheStats(ctx)

    const extraFields = () => timer.meta.extra ?? {}

    try {
      await next()
    } catch (error) {
      if (options.alwaysTrace) {
        emitTimerTrace(ctx.vtex.logger, message, timer, {
          ...extraFields(),
          failed: true,
        })
      } else {
        logRequestTimings({
          extra: { ...extraFields(), failed: true },
          logger: ctx.vtex.logger,
          message,
          slowThresholdMs: 0,
          timer,
        })
      }

      throw error
    }

    if (options.alwaysTrace) {
      emitTimerTrace(ctx.vtex.logger, message, timer, extraFields())

      return
    }

    logRequestTimings({
      extra: extraFields(),
      logger: ctx.vtex.logger,
      message,
      sampleRate: timer.meta.sampleRate,
      slowThresholdMs: timer.meta.slowThresholdMs,
      timer,
    })
  }
