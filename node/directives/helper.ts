import { currentSchema } from '../utils'

const config: any = currentSchema('b2b_users')

const PAGINATION = {
  page: 1,
  pageSize: 50,
}

// This function checks if given email is an user part of a buyer org.
// This was copied (slightly modified) from Users.ts/getAllUsers.
const isUserPartOfBuyerOrg = async (email: string, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  let hasUser = false
  const where = `email=${email}`

  try {
    let currentPage = PAGINATION.page
    let hasMore = true

    const scrollMasterData = async (): Promise<boolean> => {
      const resp = await masterdata.searchDocumentsWithPaginationInfo({
        dataEntity: config.name,
        fields: [
          'id',
          'roleId',
          'clId',
          'email',
          'name',
          'orgId',
          'costId',
          'userId',
          'canImpersonate',
          'active',
        ],
        pagination: {
          page: currentPage,
          pageSize: PAGINATION.pageSize,
        },
        schema: config.version,
        ...(where ? { where } : {}),
      })

      const { data, pagination } = resp as unknown as {
        pagination: {
          total: number
        }
        data: any
      }

      const totalPages = Math.ceil(pagination.total / PAGINATION.pageSize)

      if (currentPage >= totalPages) {
        hasMore = false
      }

      // as soon as we find an user for this email that is part of a buyer org, we can stop the search
      if (data.length > 0) {
        return true
      }

      if (hasMore) {
        currentPage += 1
        hasUser = await scrollMasterData()
      }

      return hasUser
    }

    hasUser = await scrollMasterData()
  } catch (error) {
    // if it fails at somepoint, it means we have not found any user part
    // of a buyer org until now, so we just let the function return false
  }

  return hasUser
}

export const validateAdminToken = async (
  context: Context,
  adminUserAuthToken: string
): Promise<{
  hasAdminToken: boolean
  hasValidAdminToken: boolean
  hasCurrentValidAdminToken: boolean
}> => {
  const {
    clients: { identity },
  } = context

  // check if has admin token and if it is valid
  const hasAdminToken = !!adminUserAuthToken
  let hasValidAdminToken = false
  // this is used to check if the token is valid by current standards
  let hasCurrentValidAdminToken = false

  if (hasAdminToken) {
    try {
      const authUser = await identity.validateToken({
        token: adminUserAuthToken,
      })

      // we set this flag to true if the token is valid by current standards
      // in the future we should remove this line
      hasCurrentValidAdminToken = true

      if (authUser?.audience === 'admin') {
        hasValidAdminToken = true
      }
    } catch (err) {
      // noop so we leave hasValidAdminToken as false
    }
  }

  return { hasAdminToken, hasValidAdminToken, hasCurrentValidAdminToken }
}

export const validateApiToken = async (
  context: Context
): Promise<{
  hasApiToken: boolean
  hasValidApiToken: boolean
}> => {
  const {
    clients: { identity },
  } = context

  // check if has api token and if it is valid
  const apiToken = context?.headers['vtex-api-apptoken'] as string
  const appKey = context?.headers['vtex-api-appkey'] as string
  const hasApiToken = !!(apiToken?.length && appKey?.length)
  let hasValidApiToken = false

  if (hasApiToken) {
    try {
      const { token } = await identity.getToken({
        appkey: appKey,
        apptoken: apiToken,
      })

      const authUser = await identity.validateToken({
        token,
      })

      if (authUser?.audience === 'admin') {
        hasValidApiToken = true
      }
    } catch (err) {
      // noop so we leave hasValidApiToken as false
    }
  }

  return { hasApiToken, hasValidApiToken }
}

export const validateStoreToken = async (
  context: Context,
  storeUserAuthToken: string
): Promise<{
  hasStoreToken: boolean
  hasValidStoreToken: boolean
  hasCurrentValidStoreToken: boolean
}> => {
  const {
    clients: { vtexId },
  } = context

  // check if has store token and if it is valid
  const hasStoreToken = !!storeUserAuthToken
  let hasValidStoreToken = false
  // this is used to check if the token is valid by current standards
  let hasCurrentValidStoreToken = false

  if (hasStoreToken) {
    try {
      const authUser = await vtexId.getAuthenticatedUser(storeUserAuthToken)

      if (authUser?.user) {
        // we set this flag to true if the token is valid by current standards
        // in the future we should remove this line
        hasCurrentValidStoreToken = true

        const userIsPartOfBuyerOrg = await isUserPartOfBuyerOrg(
          authUser?.user,
          context
        )

        if (userIsPartOfBuyerOrg) {
          hasValidStoreToken = true
        }
      }
    } catch (err) {
      // noop so we leave hasValidStoreToken as false
    }
  }

  return { hasStoreToken, hasValidStoreToken, hasCurrentValidStoreToken }
}
