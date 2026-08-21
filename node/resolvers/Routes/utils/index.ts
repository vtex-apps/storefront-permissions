import type { GetOrganizationByEmailBase } from '../../../typings/custom'
import { currentSchema } from '../../../utils'
import {
  COST_CENTER_DATA_ENTITY,
  ORGANIZATION_DATA_ENTITY,
} from '../../../utils/constants'
import { getUserById } from '../../Queries/Users'

const B2B_USERS_SCHEMA: { name: string; version: string } = currentSchema(
  'b2b_users'
) as any

const USER_ORG_FIELDS = ['id', 'orgId', 'costId']
const MD_SEARCH_PAGE_SIZE = 100
const MD_SEARCH_MAX_PAGES = 5

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

type UserOrgProfile = {
  id: string
  orgId: string
  costId: string
}

const getDocumentOrNull = async <T>(
  getDocument: () => Promise<T>,
  logger: Context['vtex']['logger'],
  message: string
): Promise<T | null> => {
  try {
    return await getDocument()
  } catch (error) {
    if ((error as ErrorResponse)?.response?.status !== 404) {
      logger.error({ error, message })
    }

    return null
  }
}

const toUserOrgRow = (
  user: UserOrgProfile,
  costCenterNames: Map<string, string | null>,
  organizationStatuses: Map<string, string | null>
): GetOrganizationByEmailBase => ({
  id: user.id,
  orgId: user.orgId,
  costId: user.costId,
  costCenterName: costCenterNames.get(user.costId) ?? null,
  organizationStatus: organizationStatuses.get(user.orgId) ?? '',
})

/**
 * Lists the caller's `b2b_users` profiles for an email and hydrates
 * `costCenterName` / `organizationStatus` from Master Data (`cost_centers`,
 * `organizations`). Replaces the GraphQL hop through
 * `b2b-organizations-graphql` (which called back into this app).
 */
export const listUserOrganizationsByEmail = async (
  email: string,
  ctx: Context
): Promise<GetOrganizationByEmailBase[]> => {
  const {
    clients: { masterDataExtended },
    vtex: { logger },
  } = ctx

  const costCenterNames = new Map<string, string | null>()
  const organizationStatuses = new Map<string, string | null>()
  const users: UserOrgProfile[] = []

  const hydrateNewIds = async (batch: UserOrgProfile[]) => {
    const newCostIds = [
      ...new Set(
        batch
          .map((user) => user.costId)
          .filter((id) => id && !costCenterNames.has(id))
      ),
    ]

    const newOrgIds = [
      ...new Set(
        batch
          .map((user) => user.orgId)
          .filter((id) => id && !organizationStatuses.has(id))
      ),
    ]

    await Promise.all([
      ...newCostIds.map(async (id) => {
        const costCenter: { name?: string | null } | null =
          await getDocumentOrNull(
            () =>
              masterDataExtended.getDocumentById(COST_CENTER_DATA_ENTITY, id, [
                'id',
                'name',
              ]),
            logger,
            'listUserOrganizationsByEmail.getCostCenter'
          )

        costCenterNames.set(id, costCenter ? costCenter.name ?? null : null)
      }),
      ...newOrgIds.map(async (id) => {
        const organization: { status?: string | null } | null =
          await getDocumentOrNull(
            () =>
              masterDataExtended.getDocumentById(ORGANIZATION_DATA_ENTITY, id, [
                'id',
                'status',
              ]),
            logger,
            'listUserOrganizationsByEmail.getOrganization'
          )

        organizationStatuses.set(
          id,
          organization ? organization.status ?? null : null
        )
      }),
    ])
  }

  const searchPage = (page: number) =>
    masterDataExtended.searchDocuments<UserOrgProfile>({
      dataEntity: B2B_USERS_SCHEMA.name,
      fields: USER_ORG_FIELDS,
      pagination: { page, pageSize: MD_SEARCH_PAGE_SIZE },
      schema: B2B_USERS_SCHEMA.version,
      where: `email=${email}`,
    })

  const firstPage = await searchPage(1)

  if (!firstPage?.length) {
    return []
  }

  users.push(...firstPage)
  await hydrateNewIds(firstPage)

  const hasValidCostCenter = users.some(
    (user) => (costCenterNames.get(user.costId) ?? null) !== null
  )

  const hasActiveOrg = users.some(
    (user) => organizationStatuses.get(user.orgId) !== 'inactive'
  )

  if (
    firstPage.length === MD_SEARCH_PAGE_SIZE &&
    (!hasValidCostCenter || !hasActiveOrg)
  ) {
    const remainingPages = Array.from(
      { length: MD_SEARCH_MAX_PAGES - 1 },
      (_, i) => i + 2
    )

    const additionalBatches = await Promise.all(
      remainingPages.map((page) =>
        searchPage(page).catch((error) => {
          logger.warn({ error, message: 'Failed to fetch page', page })

          return [] as UserOrgProfile[]
        })
      )
    )

    const extraUsers = additionalBatches.reduce(
      (acc, batch) => acc.concat(batch),
      [] as UserOrgProfile[]
    )

    users.push(...extraUsers)
    await hydrateNewIds(extraUsers)
  }

  return users.map((user) =>
    toUserOrgRow(user, costCenterNames, organizationStatuses)
  )
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

  const {
    vtex: { logger },
  } = ctx

  try {
    const allOrganizations = await listUserOrganizationsByEmail(email, ctx)

    const validCostCenterOrg = allOrganizations.find(
      (org) => org.costCenterName !== null
    )

    const activeOrg = allOrganizations.find(
      (org) => org.organizationStatus !== 'inactive'
    )

    const result = {
      validCostCenterId: validCostCenterOrg?.costId ?? null,
      activeOrganization: activeOrg ?? null,
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
