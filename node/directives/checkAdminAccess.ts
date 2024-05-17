import { SchemaDirectiveVisitor } from 'graphql-tools'
import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'

import sendAuthMetric, { AuthMetric } from '../metrics/auth'

export class CheckAdminAccess extends SchemaDirectiveVisitor {
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
        clients: { identity },
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

      // check if has store token but don't check if it is valid as we don't need it
      const hasStoreToken = !!storeUserAuthToken

      // now we emit a metric with all the collected data before we proceed
      const operation = field.astNode?.name?.value ?? context.request.url
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
        },
        'CheckAdminAccessAudit'
      )

      sendAuthMetric(logger, auditMetric)

      if (!hasAdminToken) {
        logger.warn({
          message: 'CheckAdminAccess: No token provided',
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

      if (!hasCurrentValidAdminToken) {
        logger.warn({
          message: 'CheckAdminAccess: Invalid token',
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
        throw new ForbiddenError('Unauthorized Access')
      }

      return resolve(root, args, context, info)
    }
  }
}
