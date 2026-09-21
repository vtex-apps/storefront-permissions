/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Session fields `setProfile` may write when resolving a B2B shopper. When the
 * computed value matches what the transform already received, omit it so Session
 * Manager does not treat the response as a change and re-run the DAG.
 */
const OMIT_WHEN_EQUAL: Array<{
  inputField: string
  inputNs: string
  outputField: string
  outputNs: string
}> = [
  { inputNs: 'public', inputField: 'facets', outputNs: 'public', outputField: 'facets' },
  { inputNs: 'public', inputField: 'sc', outputNs: 'public', outputField: 'sc' },
  {
    inputNs: 'public',
    inputField: 'regionId',
    outputNs: 'public',
    outputField: 'regionId',
  },
  {
    inputNs: 'public',
    inputField: 'postalCode',
    outputNs: 'public',
    outputField: 'postalCode',
  },
  {
    inputNs: 'public',
    inputField: 'country',
    outputNs: 'public',
    outputField: 'country',
  },
  {
    inputNs: 'storefront-permissions',
    inputField: 'hash',
    outputNs: 'storefront-permissions',
    outputField: 'hash',
  },
  {
    inputNs: 'storefront-permissions',
    inputField: 'organization',
    outputNs: 'storefront-permissions',
    outputField: 'organization',
  },
  {
    inputNs: 'storefront-permissions',
    inputField: 'costcenter',
    outputNs: 'storefront-permissions',
    outputField: 'costcenter',
  },
  {
    inputNs: 'public',
    inputField: 'costCenterAddressId',
    outputNs: 'storefront-permissions',
    outputField: 'costCenterAddressId',
  },
]

export const normalizeSetProfileFieldValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

const readInputValue = (body: any, namespace: string, field: string): unknown =>
  body?.[namespace]?.[field]?.value

export const omitUnchangedSetProfileFields = (body: any, response: any): void => {
  if (!body || !response) {
    return
  }

  for (const {
    inputField,
    inputNs,
    outputField,
    outputNs,
  } of OMIT_WHEN_EQUAL) {
    const outputContainer = response[outputNs]

    if (!outputContainer || !(outputField in outputContainer)) {
      continue
    }

    const outputValue = outputContainer[outputField]?.value
    const inputValue = readInputValue(body, inputNs, inputField)

    if (
      normalizeSetProfileFieldValue(outputValue) ===
      normalizeSetProfileFieldValue(inputValue)
    ) {
      delete outputContainer[outputField]
    }
  }
}
