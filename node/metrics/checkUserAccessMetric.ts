import { B2B_METRIC_NAME } from '../clients/metrics'
import type { AuthAuditMetric, AuthMetric } from './auth'

export class CheckUserAccessMetric implements AuthMetric {
  public readonly description: string
  public readonly kind: string
  public readonly account: string
  public readonly fields: AuthAuditMetric
  public readonly name = B2B_METRIC_NAME

  constructor(account: string, fields: AuthAuditMetric) {
    this.account = account
    this.fields = fields
    this.kind = 'b2b-storefront-permissions-check-user-access'
    this.description = 'CheckUserAccess'
  }
}
