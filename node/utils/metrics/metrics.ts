import axios from 'axios'

const ANALYTICS_URL = 'https://rc.vtex.com/api/analytics/schemaless-events'

export type ChangeTeamMetric = {
  kind: 'change-team-graphql-event'
  description: 'User change team/organization - Graphql'
}

export type Metric = {
  name: 'b2b-suite-buyerorg-data'
  account: string
} & ChangeTeamMetric

export const sendMetric = async (metric: Metric) => {
  try {
    await axios.post(ANALYTICS_URL, metric)
  } catch (error) {
    console.warn('Unable to log metrics', error)
  }
}
