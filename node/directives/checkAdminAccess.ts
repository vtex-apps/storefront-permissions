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
        vtex: { adminUserAuthToken, logger },
        clients: { identity },
      } = context

      const operation = field.astNode?.name?.value ?? context.request.url
      const metric = new AuthMetric(
        context.vtex.account,
        {
          operation,
          forwardedHost: context.request.header['x-forwarded-host'] as string,
          caller: context.request.header['x-vtex-caller'] as string,
          userAgent: context.request.header['user-agent'] as string,
          hasAdminToken: !!adminUserAuthToken,
          hasStoreToken: false,
          hasApiToken: false,
        },
        'CheckAdminAccess'
      )

      if (!adminUserAuthToken) {
        metric.error = 'No admin token provided'
        sendAuthMetric(logger, metric)
        logger.warn({
          message: 'CheckAdminAccess: No admin token provided',
          userAgent: context.request.header['user-agent'],
          vtexCaller: context.request.header['x-vtex-caller'],
          forwardedHost: context.request.header['x-forwarded-host'],
          operation,
        })
        throw new AuthenticationError('No token was provided')
      }

      try {
        const authUser = await identity.validateToken({
          token: adminUserAuthToken,
        })

        // This is the first step before actually enabling this code.
        // For now we only log in case of errors, but in follow up commits
        // we should also throw an exception inside this if in case of errors
        if (!authUser?.audience || authUser?.audience !== 'admin') {
          metric.error = 'Token is not an admin token'
          sendAuthMetric(logger, metric)
          logger.warn({
            message: `CheckUserAccess: Token is not an admin token`,
            userAgent: context.request.header['user-agent'],
            vtexCaller: context.request.header['x-vtex-caller'],
            forwardedHost: context.request.header['x-forwarded-host'],
            operation,
          })
        }
      } catch (err) {
        metric.error = 'Invalid token'
        sendAuthMetric(logger, metric)
        logger.warn({
          error: err,
          message: 'CheckAdminAccess: Invalid token',
          userAgent: context.request.header['user-agent'],
          vtexCaller: context.request.header['x-vtex-caller'],
          forwardedHost: context.request.header['x-forwarded-host'],
          operation,
          token: adminUserAuthToken,
        })
        throw new ForbiddenError('Unauthorized Access')
      }

      return resolve(root, args, context, info)
    }
  }
}
