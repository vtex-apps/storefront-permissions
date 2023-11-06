import type { Metric } from '../../clients/metrics'
import { B2B_METRIC_NAME, sendMetric } from '../../clients/metrics'

type ChangeTeamFieldsMetric = {
  date: string
  user_id: string
  user_role: string
  user_email: string
  new_org_id: string
  new_cost_center_id: string
}

export class ChangeTeamMetric implements Metric {
  public readonly description: string
  public readonly kind: string
  public readonly account: string
  public readonly fields: ChangeTeamFieldsMetric
  public readonly name = B2B_METRIC_NAME

  constructor(account: string, fields: ChangeTeamFieldsMetric) {
    this.account = account
    this.fields = fields
    this.kind = 'change-team-graphql-event'
    this.description = 'User change team/organization - Graphql'
  }
}

export type ChangeTeamParams = {
  account: string
  userId: string
  userRole: string
  userEmail: string
  orgId: string
  costCenterId: string
}

const buildMetric = (metricParams: ChangeTeamParams): ChangeTeamMetric => {
  return new ChangeTeamMetric(metricParams.account, {
    date: new Date().toISOString(),
    user_id: metricParams.userId,
    user_role: metricParams.userRole,
    user_email: metricParams.userEmail,
    new_org_id: metricParams.orgId,
    new_cost_center_id: metricParams.costCenterId,
  })
}

export const sendChangeTeamMetric = async (metricParams: ChangeTeamParams) => {
  try {
    const metric = buildMetric(metricParams)

    await sendMetric(metric)
  } catch (error) {
    console.warn('Unable to log metrics', error)
  }
}
