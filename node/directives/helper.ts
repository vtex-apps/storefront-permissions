import { getActiveUserByEmail } from '../resolvers/Queries/Users'

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
        token: adminUserAuthToken as string,
      })

      // we set this flag to true if the token is valid by current standards
      // in the future we should remove this line
      hasCurrentValidAdminToken = true

      if (authUser?.audience === 'admin') {
        hasValidAdminToken = true
      } else {
        hasValidAdminToken = false
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
      } else {
        hasValidApiToken = false
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
      const authUser = await vtexId.getAuthenticatedUser(
        storeUserAuthToken as string
      )

      if (authUser?.user) {
        // we set this flag to true if the token is valid by current standards
        // in the future we should remove this line
        hasCurrentValidStoreToken = true

        const user = (await getActiveUserByEmail(
          null,
          { email: authUser?.user },
          context
        )) as { roleId: string } | null

        if (user?.roleId) {
          hasValidStoreToken = true
        } else {
          hasValidStoreToken = false
        }
      } else {
        hasValidStoreToken = false
      }
    } catch (err) {
      // noop so we leave hasValidStoreToken as false
    }
  }

  return { hasStoreToken, hasValidStoreToken, hasCurrentValidStoreToken }
}
