/* eslint-disable @typescript-eslint/no-explicit-any */
import type { VBase } from '@vtex/api'

import { describeClientError } from './clientError'

export const B2B_SETTINGS_BUCKET = 'b2b_settings'

/**
 * VBase answers 404 when the file has never been written. That is the only
 * case where an RMW writer may bootstrap `{}` and continue to saveJSON.
 * 5xx / timeout / unknown must abort the write so we never overwrite real
 * settings with an empty object (B2BTEAM-3969 fail-closed).
 */
export const isVBaseNotFound = (error: any): boolean =>
  error?.response?.status === 404

/**
 * Read `b2b_settings` for an RMW writer.
 * - 404 / not-found → return `{}` so the caller can bootstrap.
 * - any other failure → structured log + rethrow (caller must not saveJSON).
 */
export const readB2BSettingsOrThrow = async (
  vbase: VBase,
  app: string,
  logger: Context['vtex']['logger'],
  messageKey: string
): Promise<Record<string, any>> => {
  try {
    return (await vbase.getJSON(B2B_SETTINGS_BUCKET, app)) as Record<
      string,
      any
    >
  } catch (error) {
    if (isVBaseNotFound(error)) {
      return {}
    }

    logger.error({
      error: describeClientError(error),
      message: messageKey,
    })

    throw error
  }
}
