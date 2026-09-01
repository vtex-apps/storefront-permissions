import type { Metric } from '../clients/metrics'
import { B2B_METRIC_NAME, sendMetric } from '../clients/metrics'
import { describeClientError } from './clientError'

/**
 * The platform log pipeline samples `io_vtex_logs` deterministically (1 in 20
 * at the time of writing), and it does not spare the `error` level - so any
 * count built from logs is an estimate, and a rare-but-important event can be
 * dropped entirely. Signals that must be *counted*, not estimated, are shipped
 * additionally through the analytics events channel, which this app already
 * uses for its auth audit events and which does not go through that sampling.
 *
 * The log line remains the debugging surface (it carries the shopper context);
 * the event is the measuring surface. Both are emitted, they are not
 * alternatives.
 *
 * Privacy contract, stricter than the logs: identifiers only (organization,
 * cost center, address id, error codes). Never emails, names, addresses or
 * payloads - analytics events live in a different store with its own retention
 * and audience.
 */

interface ObservabilityEvent extends Metric {
  readonly fields: Record<string, string | number | boolean | null>
}

export const sendObservabilityEvent = (
  ctx: Context,
  name: string,
  fields: Record<string, string | number | boolean | null>
) => {
  const {
    vtex: { account, logger, workspace },
  } = ctx

  const event: ObservabilityEvent = {
    account,
    description: name,
    fields: { ...fields, workspace },
    kind: `b2b-storefront-permissions-${name}`,
    name: B2B_METRIC_NAME,
  }

  // Fire-and-forget: measurement must never affect the request. A failure is
  // logged (and that log is sampled), which is acceptable - losing one count
  // beats failing a session transform.
  sendMetric(event).catch((error) => {
    logger.warn({
      error: describeClientError(error),
      event: name,
      message: 'observabilityEvent.sendError',
    })
  })
}
