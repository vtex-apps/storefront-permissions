import type { Logger } from '@vtex/api/lib/service/logger/logger'

import type { Metric } from '../clients/metrics'
import { B2B_METRIC_NAME, sendMetric } from '../clients/metrics'

export interface SessionAuditMetric {
  operation: string
  forwardedHost: string
  caller: string
  userAgent: string
  hasSessionToken: boolean
  hasSessionTokenOnHeader: boolean
  hasSessionData: boolean
}

export class SessionMetric implements Metric {
  public readonly description: string
  public readonly kind: string
  public readonly account: string
  public readonly fields: SessionAuditMetric
  public readonly name = B2B_METRIC_NAME
  public error?: string

  constructor(account: string, fields: SessionAuditMetric) {
    this.account = account
    this.fields = fields
    this.kind = 'b2b-storefront-permissions-session-event'
    this.description = 'Session metric event'
  }
}

const sendSessionMetric = async (
  logger: Logger,
  sessionMetric: SessionMetric
) => {
  try {
    await sendMetric(sessionMetric)
  } catch (error) {
    logger.error({
      error,
      message: `Error to send metrics from session metric`,
    })
  }
}

export default sendSessionMetric
