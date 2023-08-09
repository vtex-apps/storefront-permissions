import type { Metric } from './metrics'
import { sendMetric } from './metrics'

type ChangeTeamFieldsMetric = {
  date: string
  user_id: string
  user_role: string
  user_email: string
  new_org_id: string
  new_cost_center_id: string
}

type ChangeTeamMetric = Metric & { fields: ChangeTeamFieldsMetric }

export type ChangeTeamParams = {
  account: string
  userId: string
  userRole: string
  userEmail: string
  orgId: string
  costCenterId: string
}

const buildMetric = (metricParams: ChangeTeamParams): ChangeTeamMetric => {
  return {
    name: 'b2b-suite-buyerorg-data' as const,
    account: metricParams.account,
    kind: 'change-team-graphql-event',
    description: 'User change team/organization - Graphql',
    fields: {
      date: new Date().toISOString(),
      user_id: metricParams.userId,
      user_role: metricParams.userRole,
      user_email: metricParams.userEmail,
      new_org_id: metricParams.orgId,
      new_cost_center_id: metricParams.costCenterId,
    },
  }
}

export const sendChangeTeamMetric = async (metricParams: ChangeTeamParams) => {
  try {
    const metric = buildMetric(metricParams)

    await sendMetric(metric)
  } catch (error) {
    console.warn('Unable to log metrics', error)
  }
}
