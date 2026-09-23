import {
  clearStorefrontPermissionsPinFields,
  omitUnchangedSetProfileFields,
} from '../utils/omitUnchangedSetProfileFields'

describe('clearStorefrontPermissionsPinFields', () => {
  it('removes pinned B2B fields instead of leaving empty-string values', () => {
    const response = {
      'storefront-permissions': {
        costcenter: { value: '' },
        costCenterAddressId: { value: '' },
        hash: { value: '' },
        organization: { value: '' },
        userId: { value: '' },
      },
    }

    clearStorefrontPermissionsPinFields(response)

    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(response['storefront-permissions'].hash).toBeUndefined()
    expect(response['storefront-permissions'].costCenterAddressId).toBeUndefined()
    expect(response['storefront-permissions'].userId).toEqual({ value: '' })
  })
})

describe('omitUnchangedSetProfileFields with cleared pins', () => {
  it('does not reintroduce empty-string pin fields when the session still carries a sticky org', () => {
    const body = {
      'storefront-permissions': {
        costcenter: { value: '0000001322-cc' },
        hash: { value: 'old-hash' },
        organization: { value: '0000001322' },
      },
    }

    const response = {
      'storefront-permissions': {
        costcenter: { value: '' },
        costCenterAddressId: { value: '' },
        hash: { value: '' },
        organization: { value: '' },
      },
    }

    clearStorefrontPermissionsPinFields(response)
    omitUnchangedSetProfileFields(body, response)

    expect(response['storefront-permissions'].organization).toBeUndefined()
    expect(response['storefront-permissions'].costcenter).toBeUndefined()
    expect(response['storefront-permissions'].hash).toBeUndefined()
    expect(response['storefront-permissions'].costCenterAddressId).toBeUndefined()
  })
})
