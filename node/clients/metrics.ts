import axios from 'axios'

const ANALYTICS_URL = 'https://rc.vtex.com/api/analytics/schemaless-events'

export const B2B_METRIC_NAME = 'b2b-suite-buyerorg-data'

export interface Metric {
  readonly account: string
  readonly kind: string
  readonly description: string
  readonly name: typeof B2B_METRIC_NAME
}

export const sendMetric = async (metric: Metric) => {
  // Every caller is fire-and-forget, so a slow analytics endpoint never blocks
  // a request - but without a timeout each pending POST would hold a socket
  // and its promise for as long as the endpoint hangs. Bounding it keeps the
  // worst case at a few seconds of idle socket, not unbounded accumulation.
  await axios.post(ANALYTICS_URL, metric, { timeout: 3000 })
}
