import type { GetOrganizationByEmailBase } from '../../../typings/custom'
import { getUserById } from '../../Queries/Users'

// Simple in-memory cache with TTL
const organizationsCache = new Map<string, { data: any; timestamp: number }>()

export class ErrorResponse extends Error {
  public response: {
    status: number
  } = {
    status: 500,
  }
}

export const QUERIES = {
  getB2BSettings: `query Settings {
      getB2BSettings {
        uiSettings {
          clearCart
        }
      }
  }`,
  getCostCenterById: `query Costcenter($id: ID!) {
      getCostCenterById(id: $id) {
        paymentTerms {
          id
          name
        }
        name
        organization
        addresses {
          addressId
          addressType
          addressQuery
          postalCode
          country
          receiverName
          city
          state
          street
          number
          complement
          neighborhood
          geoCoordinates
          reference
        }
        phoneNumber
        businessDocument
        stateRegistration
        sellers {
          id
          name
        }
      }
    }`,
  getMarketingTags: `
    query ($costId: ID!) {
      getMarketingTags(costId: $costId){
        tags
      }
    }
  `,
  getOrganizationById: `query Organization($id: ID!){
      getOrganizationById(id: $id){
        name
        tradeName
        status
        priceTables
        salesChannel
        sellers {
          id
          name
        }
        collections {
          id
        }
      }
    }`,
  getOrganizationsByEmail: `query Organizations($email: String!) {
       getOrganizationsByEmail(email: $email){
          id
          organizationStatus
          costId
          orgId
          costCenterName
       }
  }`,
  getOrganizationsPaginatedByEmail: `query OrganizationsPaginated($email: String!, $page: Int, $pageSize: Int) {
    getOrganizationsPaginatedByEmail(
      email: $email
      page: $page
      pageSize: $pageSize
    ) {
      data {
        id
        organizationStatus
        costId
        orgId
        costCenterName
      }
      pagination {
        page
        pageSize
        total
      }
    }
  }`,
}

export const generateClUser = async ({
  clId,
  phoneNumber,
  businessName,
  businessDocument,
  tradeName,
  isCorporate,
  stateRegistration,
  ctx,
}: {
  clId: string
  phoneNumber: string | null
  businessName: string | null
  businessDocument: string | null
  tradeName: string | null
  isCorporate: boolean
  stateRegistration: string | null
  ctx: Context
}) => {
  const {
    vtex: { logger },
  } = ctx

  if (!clId) {
    return null
  }

  const clUser = await getUserById(null, { id: clId }, ctx).catch((error) => {
    logger.error({ message: 'setProfile.getUserByIdError', error })
  })

  if (!clUser) {
    return null
  }

  if (clUser.isCorporate === null) {
    clUser.isCorporate = false
  }

  if (phoneNumber) {
    clUser.phone = phoneNumber
  }

  if (isCorporate) {
    clUser.isCorporate = true
    clUser.document = null
    clUser.corporateName = businessName
    clUser.corporateDocument = businessDocument
    clUser.stateInscription = stateRegistration
    if (phoneNumber) {
      clUser.corporatePhone = phoneNumber
    }

    if (tradeName) {
      clUser.tradeName = tradeName
    }
  }

  return clUser
}

/**
 * Unified method to get user organizations data with caching.
 * Fetches all organizations for an email and returns relevant data for different validations.
 *
 * @param email - The email associated with the organizations.
 * @param ctx - The request context containing the organization client.
 * @param useCache - Whether to use cache (default: true)
 * @returns Object containing validCostCenterId and activeOrganization, or null values if not found.
 */
export const getUserOrganizationsData = async (
  email: string,
  ctx: Context,
  useCache = true
): Promise<{
  validCostCenterId: string | null
  activeOrganization: GetOrganizationByEmailBase | null
}> => {
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache
  const cacheKey = `orgs-${email}`

  // Check cache first
  if (useCache) {
    const cached = organizationsCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const { validCostCenterId, activeOrganization } = cached.data

      return { validCostCenterId, activeOrganization }
    }
  }

  const { organizations } = ctx.clients
  const {
    vtex: { logger },
  } = ctx

  try {
    const firstResponse = await organizations.getOrganizationsPaginatedByEmail(
      email,
      1,
      200 // Most users have < 200 orgs, this usually gets everything in one call
    )

    const { data: firstPageData, pagination } =
      firstResponse?.data?.getOrganizationsPaginatedByEmail || {}

    if (!firstPageData?.length) {
      return { validCostCenterId: null, activeOrganization: null }
    }

    const allOrganizations = [...firstPageData]

    // Only paginate if there are more pages and we haven't found both values
    const totalPages = Math.ceil((pagination?.total || 0) / 200)

    if (totalPages > 1) {
      // Check if we already have what we need from first page
      const hasValidCostCenter = firstPageData.some(
        (org) => org.costCenterName !== null
      )

      const hasActiveOrg = firstPageData.some(
        (org) => org.organizationStatus !== 'inactive'
      )

      // Only fetch more pages if we're missing data
      if (!hasValidCostCenter || !hasActiveOrg) {
        // Fetch remaining pages in parallel for better performance
        const remainingPages = Array.from(
          { length: Math.min(totalPages - 1, 4) }, // Limit to 5 total pages max
          (_, i) => i + 2
        )

        const additionalResponses = await Promise.all(
          remainingPages.map((page) =>
            organizations
              .getOrganizationsPaginatedByEmail(email, page, 200)
              .catch((error) => {
                logger.warn({ error, message: 'Failed to fetch page', page })

                return null
              })
          )
        )

        // Combine all results
        for (const response of additionalResponses) {
          if (response?.data?.getOrganizationsPaginatedByEmail?.data) {
            allOrganizations.push(
              ...response.data.getOrganizationsPaginatedByEmail.data
            )
          }
        }
      }
    }

    // Find required values from all organizations
    const validCostCenterOrg = allOrganizations.find(
      (org) => org.costCenterName !== null
    )

    const activeOrg = allOrganizations.find(
      (org) => org.organizationStatus !== 'inactive'
    )

    const result = {
      validCostCenterId: validCostCenterOrg?.costId || null,
      activeOrganization: activeOrg || null,
    }

    // Cache the result
    if (useCache) {
      organizationsCache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      })

      // Clean old cache entries periodically (simple strategy)
      if (organizationsCache.size > 100) {
        const now = Date.now()

        for (const [key, value] of organizationsCache.entries()) {
          if (now - value.timestamp > CACHE_TTL) {
            organizationsCache.delete(key)
          }
        }
      }
    }

    return result
  } catch (error) {
    logger.error({
      error,
      message: 'getUserOrganizationsData.error',
      email,
    })

    return { validCostCenterId: null, activeOrganization: null }
  }
}
