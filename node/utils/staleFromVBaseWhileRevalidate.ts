/* eslint-disable max-params */
import { createHash } from 'crypto'

import type { VBase } from '@vtex/api'
import type { Logger } from '@vtex/api/lib/service/logger/logger'

import type { StaleRevalidateData } from '../typings/staleFromVBaseWhileRevalidate'
import { describeClientError } from './clientError'

const DEFAULT_EXPIRATION_IN_MINUTES = 30

export interface StaleFromVBaseOptions {
  expirationInMinutes?: number
  /**
   * Failures here are recoverable by design (a failed read falls back to the
   * origin, a failed background refresh keeps serving the last value), which is
   * exactly why they must be logged: without it a broken origin or a VBase
   * outage keeps looking perfectly healthy.
   */
  logger?: Logger
}

const getTTL = (expirationInMinutes?: number) => {
  const ttl = new Date()

  ttl.setMinutes(
    ttl.getMinutes() + (expirationInMinutes ?? DEFAULT_EXPIRATION_IN_MINUTES)
  )

  return ttl
}

/**
 * VBase keys have a restricted charset, so hash the logical key to keep
 * callers free to use any descriptive string.
 *
 * The logs below reference this hashed storage name, never the logical key:
 * logical keys can carry identifiers (the active-user key contains the
 * shopper's email), and error logs must not. The hash is deterministic, so a
 * known logical key can still be located by hashing it.
 */
const normalizedJSONFile = (filePath: string) =>
  `${createHash('md5').update(filePath).digest('hex')}.json`

const revalidate = async <T>(
  vbase: VBase,
  bucket: string,
  filePath: string,
  endDate: Date,
  validateFunction: (params?: any) => Promise<T>,
  params?: unknown,
  logger?: Logger
): Promise<T> => {
  const data = await validateFunction(params)

  // Never block the caller on the cache write.
  vbase
    .saveJSON<StaleRevalidateData<T>>(bucket, filePath, {
      data,
      ttl: endDate,
    })
    .catch((error) => {
      logger?.error({
        bucket,
        error: describeClientError(error),
        key: filePath,
        message: 'staleFromVBase.saveError',
      })
    })

  return data
}

/**
 * Cross-pod cache backed by VBase, with stale-while-revalidate semantics.
 *
 * Unlike an in-memory LRU (which every pod has to warm up independently, so
 * each cold pod pays the full upstream cost), VBase is shared storage: the
 * first pod to populate it warms the cache for all of them.
 *
 * - No entry: fetch upstream, store, return (blocking, only once per TTL).
 * - Fresh entry: return it (one VBase read).
 * - Stale entry: return the stale value immediately and refresh in the
 *   background, so a slow upstream never lands on the request path.
 */
export const staleFromVBaseWhileRevalidate = async <T>(
  vbase: VBase,
  bucket: string,
  filePath: string,
  validateFunction: (params?: any) => Promise<T>,
  params?: unknown,
  options?: StaleFromVBaseOptions
): Promise<T> => {
  const logger = options?.logger
  const normalizedFilePath = normalizedJSONFile(filePath)

  const cachedData = (await vbase
    .getJSON<StaleRevalidateData<T>>(bucket, normalizedFilePath, true)
    .catch((error) => {
      // Recoverable (the origin is called instead), but a VBase outage must
      // still be visible somewhere.
      logger?.warn({
        bucket,
        error: describeClientError(error),
        key: normalizedFilePath,
        message: 'staleFromVBase.readError',
      })

      return null
    })) as StaleRevalidateData<T> | null

  if (!cachedData) {
    return revalidate<T>(
      vbase,
      bucket,
      normalizedFilePath,
      getTTL(options?.expirationInMinutes),
      validateFunction,
      params,
      logger
    )
  }

  const { data, ttl } = cachedData

  if (new Date() < new Date(ttl)) {
    return data
  }

  revalidate<T>(
    vbase,
    bucket,
    normalizedFilePath,
    getTTL(options?.expirationInMinutes),
    validateFunction,
    params,
    logger
  ).catch((error) => {
    // The stale value keeps being served, so without this log a failing origin
    // would go completely unnoticed.
    logger?.error({
      bucket,
      error: describeClientError(error),
      key: normalizedFilePath,
      message: 'staleFromVBase.revalidateError',
    })
  })

  return data
}
