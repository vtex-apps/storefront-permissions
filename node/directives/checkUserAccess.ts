import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import { getActiveUserByEmail } from '../resolvers/Queries/Users'
import sendAuthMetric, { AuthMetric } from '../metrics/auth'

export async function checkUserOrAdminTokenAccess(
  ctx: Context,
  operation?: string
) {
  const {
    vtex: { adminUserAuthToken, storeUserAuthToken, logger },
    clients: { identity, vtexId },
  } = ctx

  const metric = new AuthMetric(
    ctx.vtex.account,
    {
      operation: operation ?? ctx.request.url,
      forwardedHost: ctx.request.header['x-forwarded-host'] as string,
      caller: ctx.request.header['x-vtex-caller'] as string,
      userAgent: ctx.request.header['user-agent'] as string,
      hasAdminToken: !!adminUserAuthToken,
      hasStoreToken: !!storeUserAuthToken,
      hasApiToken: false,
    },
    'CheckUserAccess'
  )

  if (!adminUserAuthToken && !storeUserAuthToken) {
    metric.error = 'No admin or store token was provided'
    sendAuthMetric(logger, metric)
    logger.warn({
      message: `CheckUserAccess: No admin or store token was provided`,
      userAgent: ctx.request.header['user-agent'],
      vtexCaller: ctx.request.header['x-vtex-caller'],
      forwardedHost: ctx.request.header['x-forwarded-host'],
      operation,
    })
    throw new AuthenticationError('No admin or store token was provided')
  }

  if (adminUserAuthToken) {
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
          userAgent: ctx.request.header['user-agent'],
          vtexCaller: ctx.request.header['x-vtex-caller'],
          forwardedHost: ctx.request.header['x-forwarded-host'],
          operation,
        })
      }
    } catch (err) {
      metric.error = 'Invalid admin token'
      sendAuthMetric(logger, metric)
      logger.warn({
        error: err,
        message: `CheckUserAccess: Invalid admin token`,
        userAgent: ctx.request.header['user-agent'],
        vtexCaller: ctx.request.header['x-vtex-caller'],
        forwardedHost: ctx.request.header['x-forwarded-host'],
        operation,
      })
      throw new ForbiddenError('Unauthorized Access')
    }
  } else if (storeUserAuthToken) {
    let authUser = null

    try {
      authUser = await vtexId.getAuthenticatedUser(storeUserAuthToken)
      if (!authUser?.user) {
        metric.error = 'No valid user found by store user token'
        sendAuthMetric(logger, metric)
        logger.warn({
          message: `CheckUserAccess: No valid user found by store user token`,
          userAgent: ctx.request.header['user-agent'],
          vtexCaller: ctx.request.header['x-vtex-caller'],
          forwardedHost: ctx.request.header['x-forwarded-host'],
          operation,
        })
        authUser = null
      } else {
        // This is the first step before actually enabling this code.
        // For now we only log in case of errors, but in follow up commits
        // we will remove this additional try/catch and set authUser = null
        // in case of errors
        try {
          const user = (await getActiveUserByEmail(
            null,
            { email: authUser?.user },
            ctx
          )) as { roleId: string } | null

          if (!user?.roleId) {
            metric.error = 'No active user found by store user token'
            sendAuthMetric(logger, metric)
            logger.warn({
              message: `CheckUserAccess: No active user found by store user token`,
              userAgent: ctx.request.header['user-agent'],
              vtexCaller: ctx.request.header['x-vtex-caller'],
              forwardedHost: ctx.request.header['x-forwarded-host'],
              operation,
            })
          }
        } catch (err) {
          metric.error = 'Error getting user by email'
          sendAuthMetric(logger, metric)
          logger.warn({
            error: err,
            message: `CheckUserAccess: Error getting user by email`,
            userAgent: ctx.request.header['user-agent'],
            vtexCaller: ctx.request.header['x-vtex-caller'],
            forwardedHost: ctx.request.header['x-forwarded-host'],
            operation,
          })
        }
      }
    } catch (err) {
      metric.error = 'Invalid store user token'
      sendAuthMetric(logger, metric)
      logger.warn({
        error: err,
        message: `CheckUserAccess: Invalid store user token`,
        userAgent: ctx.request.header['user-agent'],
        vtexCaller: ctx.request.header['x-vtex-caller'],
        forwardedHost: ctx.request.header['x-forwarded-host'],
        operation,
      })
      authUser = null
    }

    if (!authUser) {
      throw new ForbiddenError('Unauthorized Access')
    }
  }
}

export class CheckUserAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      await checkUserOrAdminTokenAccess(context, field.astNode?.name?.value)

      return resolve(root, args, context, info)
    }
  }
}
