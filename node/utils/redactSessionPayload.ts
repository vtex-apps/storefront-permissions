/**
 * What gets logged when `logSessionPayloads` is enabled on setProfile.
 *
 * The session body and response carry shopper email (`authentication`,
 * `impersonate`, `storefront-permissions.storeUserEmail`) and locality
 * (`public.postalCode` / `country`, and any nested address objects). Logging
 * them with a raw `JSON.stringify` would put that PII into the platform log
 * pipeline.
 *
 * This walks the payload and keeps the shape useful for debugging — which
 * public keys are present, authentication flags, org/cost/user ids — while
 * replacing email strings with `<redacted-email>` and address field values
 * with `<redacted>`. Free-text strings elsewhere also go through email
 * redaction, matching `describeClientError`.
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

export const REDACTED_EMAIL = '<redacted-email>'
export const REDACTED_VALUE = '<redacted>'

/**
 * Keys whose values are address/locality PII. Aligns with the location and
 * annotation fields in `checkoutAddress.ts`, plus geo coordinates.
 */
const ADDRESS_VALUE_KEYS = new Set([
  'addressName',
  'city',
  'complement',
  'country',
  'geoCoordinates',
  'neighborhood',
  'number',
  'postalCode',
  'receiverName',
  'reference',
  'state',
  'street',
])

/** Keys whose values are (or wrap) an email address in the session namespaces. */
const EMAIL_VALUE_KEYS = new Set(['email', 'storeUserEmail'])

export const redactEmail = (value: unknown): string | null =>
  typeof value === 'string'
    ? value.replace(EMAIL_PATTERN, REDACTED_EMAIL)
    : null

const redactEmailsInString = (value: string): string =>
  value.replace(EMAIL_PATTERN, REDACTED_EMAIL)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const redactLeaf = (key: string, value: unknown): unknown => {
  if (EMAIL_VALUE_KEYS.has(key)) {
    if (typeof value === 'string') {
      return redactEmailsInString(value)
    }

    if (isPlainObject(value) && 'value' in value) {
      return {
        ...value,
        value:
          typeof value.value === 'string'
            ? redactEmailsInString(value.value)
            : value.value === null || value.value === undefined
            ? value.value
            : REDACTED_EMAIL,
      }
    }

    return value
  }

  if (ADDRESS_VALUE_KEYS.has(key)) {
    if (value === null || value === undefined || value === '') {
      return value
    }

    if (isPlainObject(value) && 'value' in value) {
      return {
        ...value,
        value:
          value.value === null ||
          value.value === undefined ||
          value.value === ''
            ? value.value
            : REDACTED_VALUE,
      }
    }

    // Arrays (geoCoordinates) and raw scalars become a single placeholder so
    // the log shows the field was populated without echoing coordinates or
    // street text.
    return REDACTED_VALUE
  }

  if (typeof value === 'string') {
    return redactEmailsInString(value)
  }

  return undefined
}

const walk = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return redactEmailsInString(value)
  }

  if (typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => walk(item))
  }

  const out: Record<string, unknown> = {}

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const leaf = redactLeaf(key, child)

    if (leaf !== undefined) {
      out[key] = leaf
      continue
    }

    out[key] = walk(child)
  }

  return out
}

/**
 * Returns a deep-cloned, PII-redacted copy of a session body or response safe
 * to pass through `JSON.stringify` into the logger.
 */
export const redactSessionPayloadForLog = (payload: unknown): unknown =>
  walk(payload)
