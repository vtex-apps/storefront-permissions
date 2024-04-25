import type { Logger } from '@vtex/api/lib/service/logger/logger'

import type { Metric } from '../clients/metrics'
import { B2B_METRIC_NAME, sendMetric } from '../clients/metrics'

export interface CheckUserAccessMetricFields {
  operation: string
  forwardedHost: string
  caller: string
  userAgent: string
  hasAdminToken: boolean
  hasStoreToken: boolean
  error: string
}

export class CheckUserAccessMetric implements Metric {
  public readonly description: string
  public readonly kind: string
  public readonly account: string
  public readonly fields: CheckUserAccessMetricFields
  public readonly name = B2B_METRIC_NAME

  constructor(account: string, fields: CheckUserAccessMetricFields) {
    this.account = account
    this.fields = fields
    this.kind = 'b2b-storefront-permissions-check-user-access'
    this.description = 'CheckUserAccess'
  }
}

const sendCheckUserAccessMetric = async (
  logger: Logger,
  metric: CheckUserAccessMetric
) => {
  try {
    await sendMetric(metric)
  } catch (error) {
    logger.error({
      error,
      message: `Error to send checkUserAccess metric`,
    })
  }
}

export default sendCheckUserAccessMetric
