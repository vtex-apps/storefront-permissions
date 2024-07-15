import type { Logger } from '@vtex/api/lib/service/logger/logger'

import type { Metric } from '../clients/metrics'
import { B2B_METRIC_NAME, sendMetric } from '../clients/metrics'

export interface AuthAuditMetric {
  operation: string
  forwardedHost: string
  caller: string
  userAgent: string
  role?: string
  permissions?: string[]
  hasAdminToken?: boolean
  hasValidAdminToken?: boolean
  hasStoreToken?: boolean
  hasValidStoreToken?: boolean
  hasApiToken?: boolean
  hasValidApiToken?: boolean
  hasValidAdminTokenFromStore?: boolean
  hasValidApiTokenFromStore?: boolean
}

export class AuthMetric implements Metric {
  public readonly description: string
  public readonly kind: string
  public readonly account: string
  public readonly fields: AuthAuditMetric
  public readonly name = B2B_METRIC_NAME
  public error?: string

  constructor(account: string, fields: AuthAuditMetric, description?: string) {
    this.account = account
    this.fields = fields
    this.kind = 'b2b-storefront-permissions-auth-event'
    this.description = description ?? 'Auth metric event'
  }
}

const sendAuthMetric = async (logger: Logger, authMetric: AuthMetric) => {
  try {
    await sendMetric(authMetric)
  } catch (error) {
    logger.error({
      error,
      message: `Error to send metrics from auth metric`,
    })
  }
}

export default sendAuthMetric
