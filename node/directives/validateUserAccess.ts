import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import type { AuthAuditTokenMetrics } from '../metrics/auth'
import sendAuthMetric, { AuthMetric } from '../metrics/auth'
import {
  validateAdminToken,
  validateApiToken,
  validateStoreToken,
} from './helper'

export class ValidateUserAccess extends SchemaDirectiveVisitor {
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
      } = context

      let hasTokens = true
      let hasValidTokens = true

      const { hasAdminToken, hasValidAdminToken } = await validateAdminToken(
        context,
        adminUserAuthToken as string
      )

      // add Admin token metrics
      let tokenMetrics: AuthAuditTokenMetrics = {
        hasAdminToken,
        hasValidAdminToken,
      }

      if (!hasAdminToken || !hasValidAdminToken) {
        const { hasApiToken, hasValidApiToken } = await validateApiToken(
          context
        )

        // add API token metrics
        tokenMetrics = {
          ...tokenMetrics,
          hasApiToken,
          hasValidApiToken,
        }

        if (!hasApiToken || !hasValidApiToken) {
          const { hasStoreToken, hasValidStoreToken } =
            await validateStoreToken(context, storeUserAuthToken as string)

          // add store token metrics
          tokenMetrics = {
            ...tokenMetrics,
            hasStoreToken,
            hasValidStoreToken,
          }

          if (!hasStoreToken || !hasValidStoreToken) {
            hasTokens = hasAdminToken || hasApiToken || hasStoreToken
            hasValidTokens =
              hasValidAdminToken || hasValidApiToken || hasValidStoreToken
          }
        }
      }

      // now we emit a metric with all the collected data before we proceed
      const operation = field?.astNode?.name?.value ?? context?.request?.url
      const userAgent = context?.request?.headers['user-agent'] as string
      const caller = context?.request?.headers['x-vtex-caller'] as string
      const forwardedHost = context?.request?.headers[
        'x-forwarded-host'
      ] as string

      const auditMetric = new AuthMetric(
        context?.vtex?.account,
        {
          operation,
          forwardedHost,
          caller,
          userAgent,
          ...tokenMetrics,
        },
        'ValidateUserAccessAudit'
      )

      sendAuthMetric(logger, auditMetric)

      if (!hasTokens) {
        logger.warn({
          message: 'ValidateUserAccess: No token provided',
          userAgent,
          caller,
          forwardedHost,
          operation,
          ...tokenMetrics,
        })
        throw new AuthenticationError('No token was provided')
      }

      if (!hasValidTokens) {
        logger.warn({
          message: `ValidateUserAccess: Invalid token`,
          userAgent,
          caller,
          forwardedHost,
          operation,
          ...tokenMetrics,
        })
        throw new ForbiddenError('Unauthorized Access')
      }

      return resolve(root, args, context, info)
    }
  }
}
