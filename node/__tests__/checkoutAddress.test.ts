import { sanitizeAddressForCheckout } from '../utils/checkoutAddress'

describe('sanitizeAddressForCheckout', () => {
  it('leaves a clean address untouched and reports no changes', () => {
    const address = {
      addressId: 'addr1',
      city: 'Springfield',
      country: 'USA',
      postalCode: '12345-678',
      reference: null,
      street: '100 Example Ave',
    }

    const { address: result, sanitized } = sanitizeAddressForCheckout(address)

    expect(sanitized).toHaveLength(0)
    expect(result).toEqual(address)
  })

  it('strips the characters checkout rejects from the reference blob', () => {
    // The exact shape seen in production: quotes alone trigger CHK0040 and made
    // checkout discard the whole shippingData attachment.
    const reference = '{ "street2":"","street3":"","street4":"","default":""}'

    const { address, sanitized } = sanitizeAddressForCheckout({ reference })

    expect(address.reference).toBe('{ street2:,street3:,street4:,default:}')
    expect(sanitized).toEqual([{ field: 'reference', removed: ['"'] }])
  })

  it('reports no address values, so nothing personal can reach a log', () => {
    const { invalid, sanitized } = sanitizeAddressForCheckout({
      complement: 'Apt 4%',
      street: 'Main St; 42',
    })

    // Whatever a caller logs from this must be safe by construction.
    const serialized = JSON.stringify({ invalid, sanitized })

    expect(serialized).not.toContain('Main St')
    expect(serialized).not.toContain('Apt 4')
    expect(
      [...invalid, ...sanitized].every(
        (entry) => Object.keys(entry).sort().join() === 'field,removed'
      )
    ).toBe(true)
  })

  it('sanitizes every offending annotation field, not just the first', () => {
    // Guards the global-regex trap: `.test()` on a /g pattern advances
    // lastIndex, which would silently skip every other field.
    const { address, sanitized } = sanitizeAddressForCheckout({
      complement: 'Suite 100%',
      reference: 'has "quotes"',
    })

    expect(sanitized.map(({ field }) => field).sort()).toEqual([
      'complement',
      'reference',
    ])
    expect(address.complement).toBe('Suite 100')
    expect(address.reference).toBe('has quotes')
  })

  it('never rewrites location-bearing fields, wherever in the world they point', () => {
    // The forbidden characters can be legitimate there: Plus Codes - used as
    // street addresses where streets have no numbering - are built around `+`,
    // and B2B receiver names use `"` as an inch mark. Stripping them may point
    // the delivery somewhere else, so these are reported, never rewritten.
    const address = {
      city: 'Nairobi;',
      neighborhood: 'A+B',
      number: '12+14',
      receiverName: 'ACME 1/2" FITTINGS',
      state: 'NBO%',
      street: 'MQRG+59 Nairobi',
    }

    const { address: result, invalid, sanitized } =
      sanitizeAddressForCheckout(address)

    expect(sanitized).toHaveLength(0)
    expect(result).toEqual(address)
    expect(invalid.map(({ field }) => field).sort()).toEqual([
      'city',
      'neighborhood',
      'number',
      'receiverName',
      'state',
      'street',
    ])
  })

  it('leaves the fields checkout does not validate alone', () => {
    // Probing the shippingData attachment showed these three accept the
    // characters, so rewriting them would be gratuitous.
    const address = {
      addressId: 'id?with+chars',
      addressQuery: 'query"with;chars',
      addressType: 'BillingAddress',
    }

    const { address: result, invalid, sanitized } =
      sanitizeAddressForCheckout(address)

    expect(sanitized).toHaveLength(0)
    expect(invalid).toHaveLength(0)
    expect(result.addressId).toBe('id?with+chars')
    expect(result.addressQuery).toBe('query"with;chars')
  })

  it('reports postal code and country instead of rewriting them', () => {
    // Both are validated by checkout, but they are codes: stripping a character
    // makes them a different location, so the caller must surface the failure
    // rather than ship to the wrong place.
    const address = { country: 'US"A', postalCode: '12345%' }

    const { address: result, invalid, sanitized } =
      sanitizeAddressForCheckout(address)

    expect(sanitized).toHaveLength(0)
    expect(result.postalCode).toBe('12345%')
    expect(result.country).toBe('US"A')
    expect(invalid).toEqual([
      { field: 'country', removed: ['"'] },
      { field: 'postalCode', removed: ['%'] },
    ])
  })

  it('does not mutate the input, which comes from a shared cache entry', () => {
    const address = { reference: 'has "quotes"' }

    sanitizeAddressForCheckout(address)

    expect(address.reference).toBe('has "quotes"')
  })

  it('ignores non-string values', () => {
    const { sanitized } = sanitizeAddressForCheckout({
      geoCoordinates: [1, 2],
      number: 42,
      reference: null,
    })

    expect(sanitized).toHaveLength(0)
  })
})
