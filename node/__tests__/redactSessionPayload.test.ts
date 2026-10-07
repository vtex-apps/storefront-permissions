import {
  REDACTED_EMAIL,
  REDACTED_VALUE,
  redactEmail,
  redactSessionPayloadForLog,
} from '../utils/redactSessionPayload'

describe('redactEmail', () => {
  it('replaces emails with the shared placeholder', () => {
    expect(redactEmail('buyer@secret.com')).toBe(REDACTED_EMAIL)
    expect(redactEmail('user buyer@secret.com not found')).toBe(
      `user ${REDACTED_EMAIL} not found`
    )
  })

  it('returns null for non-strings', () => {
    expect(redactEmail(null)).toBeNull()
    expect(redactEmail(undefined)).toBeNull()
    expect(redactEmail(12)).toBeNull()
  })
})

describe('redactSessionPayloadForLog', () => {
  const sessionLike = {
    authentication: {
      storeUserEmail: { value: 'buyer@secret.com' },
      storeUserId: { value: 'shopper-1' },
    },
    checkout: { orderFormId: { value: 'of-1' } },
    public: {
      b2bCurrentCostCenter: { value: 'cost1' },
      country: { value: 'USA' },
      facets: { value: 'collection' },
      postalCode: { value: '90210' },
    },
    'storefront-permissions': {
      costcenter: { value: 'cost1' },
      costCenterAddressId: { value: 'addr1' },
      hash: { value: 'abc' },
      organization: { value: 'org1' },
      storeUserEmail: { value: 'buyer@secret.com' },
      storeUserId: { value: 'shopper-1' },
      userId: { value: 'u1' },
    },
  }

  it('redacts emails in session namespaces and leaves ids intact', () => {
    const redacted: any = redactSessionPayloadForLog(sessionLike)
    const serialized = JSON.stringify(redacted)

    expect(serialized).not.toContain('buyer@secret.com')
    expect(redacted.authentication.storeUserEmail.value).toBe(REDACTED_EMAIL)
    expect(redacted['storefront-permissions'].storeUserEmail.value).toBe(
      REDACTED_EMAIL
    )

    expect(redacted.authentication.storeUserId.value).toBe('shopper-1')
    expect(redacted['storefront-permissions'].organization.value).toBe('org1')
    expect(redacted['storefront-permissions'].costcenter.value).toBe('cost1')
    expect(redacted['storefront-permissions'].userId.value).toBe('u1')
    expect(redacted['storefront-permissions'].costCenterAddressId.value).toBe(
      'addr1'
    )
    expect(redacted['storefront-permissions'].hash.value).toBe('abc')
    expect(redacted.checkout.orderFormId.value).toBe('of-1')
    expect(redacted.public.facets.value).toBe('collection')
    expect(redacted.public.b2bCurrentCostCenter.value).toBe('cost1')
  })

  it('redacts postalCode and country values while keeping the keys', () => {
    const redacted: any = redactSessionPayloadForLog(sessionLike)

    expect(redacted.public).toHaveProperty('postalCode')
    expect(redacted.public).toHaveProperty('country')
    expect(redacted.public.postalCode.value).toBe(REDACTED_VALUE)
    expect(redacted.public.country.value).toBe(REDACTED_VALUE)
    expect(JSON.stringify(redacted)).not.toContain('90210')
  })

  it('redacts nested address field values without dropping the object', () => {
    const withAddress = {
      addresses: [
        {
          addressId: 'addr1',
          city: 'Springfield',
          country: 'USA',
          geoCoordinates: [-46.6, -23.5],
          neighborhood: 'Downtown',
          number: '100',
          postalCode: '12345',
          receiverName: 'Jane Doe',
          street: 'Private Road 9',
        },
      ],
      orgId: 'org1',
    }

    const redacted: any = redactSessionPayloadForLog(withAddress)
    const serialized = JSON.stringify(redacted)

    expect(redacted.addresses[0].addressId).toBe('addr1')
    expect(redacted.orgId).toBe('org1')
    expect(redacted.addresses[0].street).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].number).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].city).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].receiverName).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].postalCode).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].geoCoordinates).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].neighborhood).toBe(REDACTED_VALUE)
    expect(redacted.addresses[0].country).toBe(REDACTED_VALUE)

    expect(serialized).not.toContain('Private Road')
    expect(serialized).not.toContain('Springfield')
    expect(serialized).not.toContain('Jane Doe')
    expect(serialized).not.toContain('12345')
    expect(serialized).not.toContain('-46.6')
  })

  it('redacts emails echoed into free-text strings', () => {
    const redacted: any = redactSessionPayloadForLog({
      message: 'lookup failed for buyer@secret.com',
      step: 'getActiveUserByEmail',
    })

    expect(redacted.message).toBe(`lookup failed for ${REDACTED_EMAIL}`)
    expect(redacted.step).toBe('getActiveUserByEmail')
  })

  it('preserves empty and missing address values', () => {
    const redacted: any = redactSessionPayloadForLog({
      public: {
        country: { value: '' },
        postalCode: { value: null },
      },
    })

    expect(redacted.public.country.value).toBe('')
    expect(redacted.public.postalCode.value).toBeNull()
  })
})
