/**
 * Checkout rejects a fixed set of characters in address text fields, answering
 * `CHK0040` ("The reference field not accept the characters: < > ? + " ; %") and
 * failing the whole `shippingData` attachment.
 *
 * Cost center addresses populated by integrations routinely carry them: the
 * `reference` field is often a JSON blob (`{ "street2":"", ... }`) whose quotes
 * alone are enough. Because the attachment fails as a unit, a single offending
 * character makes the cart silently keep its previous address, so switching
 * cost center appears to do nothing.
 *
 * Stripping is only applied where it cannot move the delivery (see the two
 * field lists below); everywhere else the offending field is reported and the
 * rejection stands, because a corrupted location is worse than a rejected one.
 */
export const CHECKOUT_FORBIDDEN_ADDRESS_CHARACTERS = [
  '<',
  '>',
  '?',
  '+',
  '"',
  ';',
  '%',
]

const FORBIDDEN_PATTERN = /[<>?+";%]/g

/**
 * Which fields checkout actually validates was established by probing the
 * `shippingData` attachment field by field, because it is not documented (the
 * error codes reference a `{0}` placeholder). Of the 13 fields in the address
 * contract, 10 are validated and 3 are not: `addressId`, `addressType` and
 * `addressQuery` accept the characters.
 *
 * Note the service enforces `< > ? + " ; %`. The docs additionally list `*` for
 * `CHK0040`; the service does not reject it.
 */

/**
 * Annotation fields: they describe *how* to deliver, never *where*. Stripping a
 * forbidden character from them cannot move the delivery, so rewriting is safe
 * - and `reference` is where the production failures actually come from
 * (integration-populated JSON blobs whose quotes alone trigger CHK0040).
 */
const SANITIZED_FIELDS = ['complement', 'reference']

/**
 * Location-bearing fields. VTEX serves addresses from every country, and the
 * forbidden characters can be *meaningful* in them: Plus Codes - used as street
 * addresses where streets have no numbering - are built around `+`, and B2B
 * receiver names use `"` as an inch mark. A location field with a character
 * stripped out may point somewhere else, so silently rewriting one would turn
 * a rejected cart into one shipping to the wrong place. These are reported
 * instead, and the caller surfaces the failure so the record is fixed at the
 * source.
 */
const REPORTED_FIELDS = [
  'city',
  'country',
  'neighborhood',
  'number',
  'postalCode',
  'receiverName',
  'state',
  'street',
]

/**
 * Deliberately carries no address values, only which field was rewritten and
 * which characters came out. Address data is personal data and this runs on the
 * session transform, so there is no sampling rate at which logging the values
 * would be acceptable — the metadata is enough to count and diagnose.
 */
export interface SanitizedAddressField {
  field: string
  removed: string[]
}

export interface SanitizeAddressResult<T> {
  address: T
  /**
   * Location-bearing fields that carry forbidden characters and were
   * deliberately left as they are. Checkout will reject the attachment, so the
   * caller must report this rather than let it fail silently.
   */
  invalid: SanitizedAddressField[]
  sanitized: SanitizedAddressField[]
}

const forbiddenCharactersIn = (value: string) =>
  CHECKOUT_FORBIDDEN_ADDRESS_CHARACTERS.filter((char) => value.includes(char))

/**
 * Returns a copy of the address with the forbidden characters removed, plus a
 * description of every change so the caller can report what it had to rewrite.
 * The input is never mutated (it comes from a shared cache entry).
 */
export const sanitizeAddressForCheckout = <T extends Record<string, any>>(
  address: T
): SanitizeAddressResult<T> => {
  const sanitized: SanitizedAddressField[] = []
  const result: Record<string, any> = { ...address }

  for (const field of SANITIZED_FIELDS) {
    const value = result[field]

    if (typeof value !== 'string') {
      continue
    }

    // Compare against the replacement instead of calling `.test()`: the pattern
    // is global, and `.test()` on a global regex advances `lastIndex`, which
    // would make it skip every other field it is asked about.
    const to = value.replace(FORBIDDEN_PATTERN, '')

    if (to === value) {
      continue
    }

    sanitized.push({ field, removed: forbiddenCharactersIn(value) })

    result[field] = to
  }

  const invalid: SanitizedAddressField[] = []

  for (const field of REPORTED_FIELDS) {
    const value = result[field]

    if (typeof value !== 'string') {
      continue
    }

    const removed = forbiddenCharactersIn(value)

    if (removed.length) {
      invalid.push({ field, removed })
    }
  }

  return { address: result as T, invalid, sanitized }
}
