import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import { getActiveUserByEmail } from '../resolvers/Queries/Users'
import sendAuthMetric, { AuthMetric } from '../metrics/auth'

export class CheckUserAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      const {
        vtex: { adminUserAuthToken, storeUserAuthToken, logger },
        clients: { identity, vtexId },
      } = context

      // check if has admin token and if it is valid
      const hasAdminToken = !!adminUserAuthToken
      let hasValidAdminToken
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
          // noop so we leave hasValidAdminToken as undefined
        }
      }

      // check if has api token and if it is valid
      const apiToken = context?.headers['vtex-api-apptoken'] as string
      const appKey = context?.headers['vtex-api-appkey'] as string
      const hasApiToken = !!(apiToken?.length && appKey?.length)
      let hasValidApiToken

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
          // noop so we leave hasValidApiToken as undefined
        }
      }

      // check if has store token and if it is valid
      const hasStoreToken = !!storeUserAuthToken
      let hasValidStoreToken
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
          // noop so we leave hasValidStoreToken as undefined
        }
      }

      // now we emit a metric with all the collected data before we proceed
      const operation = field?.astNode?.name?.value ?? context?.request?.url
      const auditMetric = new AuthMetric(
        context?.vtex?.account,
        {
          operation,
          forwardedHost: context?.request?.headers[
            'x-forwarded-host'
          ] as string,
          caller: context?.request?.headers['x-vtex-caller'] as string,
          userAgent: context?.request?.headers['user-agent'] as string,
          hasAdminToken,
          hasValidAdminToken,
          hasApiToken,
          hasValidApiToken,
          hasStoreToken,
          hasValidStoreToken,
        },
        'CheckUserAccessAudit'
      )

      sendAuthMetric(logger, auditMetric)

      if (!hasAdminToken && !hasStoreToken) {
        logger.warn({
          message: 'CheckUserAccess: No token provided',
          userAgent: context?.request?.headers['user-agent'],
          vtexCaller: context?.request?.headers['x-vtex-caller'],
          forwardedHost: context?.request?.headers['x-forwarded-host'],
          operation,
          hasAdminToken,
          hasValidAdminToken,
          hasApiToken,
          hasValidApiToken,
          hasStoreToken,
        })
        throw new AuthenticationError('No token was provided')
      }

      if (!hasCurrentValidAdminToken && !hasCurrentValidStoreToken) {
        logger.warn({
          message: `CheckUserAccess: Invalid token`,
          userAgent: context?.request?.headers['user-agent'],
          vtexCaller: context?.request?.headers['x-vtex-caller'],
          forwardedHost: context?.request?.headers['x-forwarded-host'],
          operation,
          hasAdminToken,
          hasValidAdminToken,
          hasApiToken,
          hasValidApiToken,
          hasStoreToken,
          hasValidStoreToken,
        })
        throw new ForbiddenError('Unauthorized Access')
      }

      return resolve(root, args, context, info)
    }
  }
}
