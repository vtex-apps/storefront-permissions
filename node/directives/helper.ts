import { isUserPartOfBuyerOrg } from '../resolvers/Queries/Users'

export const validateAdminToken = async (
  context: Context,
  adminUserAuthToken: string
): Promise<{
  hasAdminToken: boolean
  hasValidAdminToken: boolean
  hasCurrentValidAdminToken: boolean
  hasValidAdminTokenFromStore: boolean
}> => {
  const {
    clients: { identity, lm },
    vtex: { account, logger },
  } = context

  // check if has admin token and if it is valid
  const hasAdminToken = !!adminUserAuthToken
  let hasValidAdminToken = false
  // this is used to check if the token is valid by current standards
  let hasCurrentValidAdminToken = false
  // this is used to check if the token is valid and from this store
  let hasValidAdminTokenFromStore = false

  if (hasAdminToken) {
    try {
      const authUser = await identity.validateToken({
        token: adminUserAuthToken,
      })

      // we set this flag to true if the token is valid by current standards
      // in the future we should remove this line
      hasCurrentValidAdminToken = true

      if (authUser?.audience === 'admin') {
        hasValidAdminToken = await lm.getUserAdminPermissions(
          authUser.account,
          authUser.id
        )
      }

      // check if the token is from this store. Currently used for metrics
      // in future we should merge this with the previous check
      if (authUser?.audience === 'admin' && authUser?.account === account) {
        hasValidAdminTokenFromStore = await lm.getUserAdminPermissions(
          account,
          authUser.id
        )
      }
    } catch (err) {
      // noop so we leave hasValidAdminToken as false
      logger.warn({
        message: 'Error validating admin token',
        err,
      })
    }
  }

  return {
    hasAdminToken,
    hasValidAdminToken,
    hasCurrentValidAdminToken,
    hasValidAdminTokenFromStore,
  }
}

export const validateApiToken = async (
  context: Context
): Promise<{
  hasApiToken: boolean
  hasValidApiToken: boolean
  hasValidApiTokenFromStore: boolean
}> => {
  const {
    clients: { identity, lm },
    vtex: { account, logger },
  } = context

  // check if has api token and if it is valid
  const apiToken = context?.headers['vtex-api-apptoken'] as string
  const appKey = context?.headers['vtex-api-appkey'] as string
  const hasApiToken = !!(apiToken?.length && appKey?.length)
  let hasValidApiToken = false
  let hasValidApiTokenFromStore = false

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

      // check if the token is from this store. Currently used for metrics
      // in future we should merge this with the previous check
      if (authUser?.audience === 'admin' && authUser?.account === account) {
        hasValidApiTokenFromStore = await lm.getUserAdminPermissions(
          account,
          authUser.id
        )
      }
    } catch (err) {
      // noop so we leave hasValidApiToken as false
      logger.warn({
        message: 'Error validating API token',
        err,
      })
    }
  }

  return { hasApiToken, hasValidApiToken, hasValidApiTokenFromStore }
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
    vtex: { logger },
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
      logger.warn({
        message: 'Error validating store token:',
        err,
      })
    }
  }

  return { hasStoreToken, hasValidStoreToken, hasCurrentValidStoreToken }
}

export const validateAdminTokenOnHeader = async (
  context: Context
): Promise<{
  hasAdminTokenOnHeader: boolean
  hasValidAdminTokenOnHeader: boolean
  hasCurrentValidAdminTokenOnHeader: boolean
}> => {
  const adminUserAuthToken = context?.headers.vtexidclientautcookie as string
  const hasAdminTokenOnHeader = !!adminUserAuthToken?.length

  if (!hasAdminTokenOnHeader) {
    return {
      hasAdminTokenOnHeader: false,
      hasValidAdminTokenOnHeader: false,
      hasCurrentValidAdminTokenOnHeader: false,
    }
  }

  const { hasAdminToken, hasCurrentValidAdminToken, hasValidAdminToken } =
    await validateAdminToken(context, adminUserAuthToken)

  return {
    hasAdminTokenOnHeader: hasAdminToken,
    hasValidAdminTokenOnHeader: hasValidAdminToken,
    hasCurrentValidAdminTokenOnHeader: hasCurrentValidAdminToken,
  }
}
