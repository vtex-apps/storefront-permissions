import type { Logger } from '@vtex/api/lib/service/logger/logger'

import type { Metric } from '../clients/metrics'
import { B2B_METRIC_NAME, sendMetric } from '../clients/metrics'

export interface CheckAdminAccessMetricFields {
  forwardedHost: string
  caller: string
  userAgent: string
  hasAdminToken: boolean
  error: string
}

export class CheckAdminAccessMetric implements Metric {
  public readonly description: string
  public readonly kind: string
  public readonly account: string
  public readonly fields: CheckAdminAccessMetricFields
  public readonly name = B2B_METRIC_NAME

  constructor(account: string, fields: CheckAdminAccessMetricFields) {
    this.account = account
    this.fields = fields
    this.kind = 'b2b-storefront-permissions-check-admin-access'
    this.description = 'CheckAdminAccess'
  }
}

const sendCheckAdminAccessMetric = async (
  logger: Logger,
  metric: CheckAdminAccessMetric
) => {
  try {
    await sendMetric(metric)
  } catch (error) {
    logger.error({
      error,
      message: `Error to send checkAdminAccess metric`,
    })
  }
}

export default sendCheckAdminAccessMetric
