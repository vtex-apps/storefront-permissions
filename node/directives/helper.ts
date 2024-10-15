import { isUserPartOfBuyerOrg } from '../resolvers/Queries/Users'

export const validateAdminToken = async (
  context: Context,
  adminUserAuthToken: string,
  metricFields: any,
  orgPermission?: 'buyer_organization_edit' | 'buyer_organization_view'
): Promise<{
  hasAdminToken: boolean
  hasValidAdminToken: boolean
  hasCurrentValidAdminToken: boolean
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

  if (hasAdminToken) {
    try {
      const authUser = await identity.validateToken({
        token: adminUserAuthToken,
      })

      // we set this flag to true if the token is valid by current standards
      // in the future we should remove this line
      hasCurrentValidAdminToken = true

      if (
        authUser?.audience === 'admin' &&
        authUser &&
        authUser.account !== account
      ) {
        logger.warn({
          message: 'validateAdminToken: Token from another account',
          ...metricFields,
          authUserAccount: authUser.account,
          account,
          user: authUser.user,
        })
      }

      if (authUser?.audience === 'admin' && authUser?.account === account) {
        hasValidAdminToken = await lm.getUserAdminPermissions(
          account,
          authUser.id
        )

        if (
          hasValidAdminToken &&
          orgPermission &&
          authUser.tokenType === 'user'
        ) {
          await lm.checkUserAdminPermission(
            account,
            authUser.user,
            orgPermission
          )
        }
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
  }
}

export const validateApiToken = async (
  context: Context,
  metricFields: any
): Promise<{
  hasApiToken: boolean
  hasValidApiToken: boolean
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

  if (hasApiToken) {
    try {
      const { token } = await identity.getToken({
        appkey: appKey,
        apptoken: apiToken,
      })

      const authUser = await identity.validateToken({
        token,
      })

      if (
        authUser?.audience === 'admin' &&
        authUser &&
        authUser.account !== account
      ) {
        logger.warn({
          message: 'validateApiToken: Token from another account',
          ...metricFields,
          authUserAccount: authUser.account,
          account,
          user: authUser.user,
        })
      }

      if (authUser?.audience === 'admin' && authUser?.account === account) {
        hasValidApiToken = await lm.getUserAdminPermissions(
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
  context: Context,
  metricFields: any
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
    await validateAdminToken(context, adminUserAuthToken, metricFields)

  return {
    hasAdminTokenOnHeader: hasAdminToken,
    hasValidAdminTokenOnHeader: hasValidAdminToken,
    hasCurrentValidAdminTokenOnHeader: hasCurrentValidAdminToken,
  }
}
