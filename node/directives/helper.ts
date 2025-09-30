import { isUserPartOfBuyerOrg } from '../resolvers/Queries/Users'
import { LICENSE_MANAGER_ROLES, B2B_LM_PRODUCT_CODE } from '../utils/constants'

export const validateAdminToken = async (
  context: Context,
  adminUserAuthToken: string,
  metricFields: any = {},
  requiredRole: string = LICENSE_MANAGER_ROLES.B2B_ORGANIZATIONS_VIEW
): Promise<{
  hasAdminToken: boolean
  hasValidAdminToken: boolean
  hasCurrentValidAdminToken: boolean
  hasValidAdminRole: boolean
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
  let hasValidAdminRole = false

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
        const hasAdminPermissions = await lm.getUserAdminPermissions(
          account,
          authUser.id
        )

        // Check for specific role using the new endpoint
        const roleCheckResponse = await lm.checkUserSpecificRole(
          account,
          authUser.id,
          B2B_LM_PRODUCT_CODE,
          requiredRole
        )

        hasValidAdminRole = !!roleCheckResponse

        // Only set hasValidAdminToken to true if BOTH admin permissions AND role are valid
        hasValidAdminToken = hasAdminPermissions && hasValidAdminRole
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
    hasValidAdminRole,
  }
}

export const validateApiToken = async (
  context: Context,
  metricFields: any = {},
  requiredRole: string = LICENSE_MANAGER_ROLES.B2B_ORGANIZATIONS_VIEW
): Promise<{
  hasApiToken: boolean
  hasValidApiToken: boolean
  hasCurrentValidApiToken: boolean
  hasValidApiRole: boolean
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

  // this is used to check if the token is valid by current standards
  let hasCurrentValidApiToken = false
  let hasValidApiRole = false

  if (hasApiToken) {
    try {
      const { token } = await identity.getToken({
        appkey: appKey,
        apptoken: apiToken,
      })

      const authUser = await identity.validateToken({
        token,
      })

      // we set this flag to true if the token is valid by current standards
      // in the future we should remove this line
      hasCurrentValidApiToken = true
      // keeping this behavior for now, but we should remove it in the future as well
      context.cookies.set('VtexIdclientAutCookie', token)
      context.vtex.adminUserAuthToken = token

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
        const hasAdminPermissions = await lm.getUserAdminPermissions(
          account,
          authUser.id
        )

        // Check for specific role using the new endpoint
        const roleCheckResponse = await lm.checkUserSpecificRole(
          account,
          authUser.id,
          B2B_LM_PRODUCT_CODE,
          requiredRole
        )

        hasValidApiRole = !!roleCheckResponse

        // Only set hasValidApiToken to true if BOTH admin permissions AND role are valid
        hasValidApiToken = hasAdminPermissions && hasValidApiRole
      }
    } catch (err) {
      // noop so we leave hasValidApiToken as false
      logger.warn({
        message: 'Error validating API token',
        err,
      })
    }
  }

  return {
    hasApiToken,
    hasValidApiToken,
    hasCurrentValidApiToken,
    hasValidApiRole,
  }
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

        // adding log to better understand invalid store token use cases
        // in the future we should remove this log
        if (hasCurrentValidStoreToken && !hasValidStoreToken) {
          logger.warn({
            message: 'Invalid store token:',
            operation: context?.request?.url,
            userAgent: context?.request?.headers['user-agent'] as string,
            caller: context?.request?.headers['x-vtex-caller'] as string,
            forwardedHost: context?.request?.headers[
              'x-forwarded-host'
            ] as string,
            authUser,
          })
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
  metricFields: any = {},
  requiredRole: string = LICENSE_MANAGER_ROLES.B2B_ORGANIZATIONS_VIEW
): Promise<{
  hasAdminTokenOnHeader: boolean
  hasValidAdminTokenOnHeader: boolean
  hasCurrentValidAdminTokenOnHeader: boolean
  hasValidAdminRoleOnHeader: boolean
}> => {
  const adminUserAuthToken = context?.headers.vtexidclientautcookie as string
  const hasAdminTokenOnHeader = !!adminUserAuthToken?.length

  if (!hasAdminTokenOnHeader) {
    return {
      hasAdminTokenOnHeader: false,
      hasValidAdminTokenOnHeader: false,
      hasCurrentValidAdminTokenOnHeader: false,
      hasValidAdminRoleOnHeader: false,
    }
  }

  const {
    hasAdminToken,
    hasCurrentValidAdminToken,
    hasValidAdminToken,
    hasValidAdminRole,
  } = await validateAdminToken(
    context,
    adminUserAuthToken,
    metricFields,
    requiredRole
  )

  return {
    hasAdminTokenOnHeader: hasAdminToken,
    hasValidAdminTokenOnHeader: hasValidAdminToken,
    hasCurrentValidAdminTokenOnHeader: hasCurrentValidAdminToken,
    hasValidAdminRoleOnHeader: hasValidAdminRole,
  }
}
