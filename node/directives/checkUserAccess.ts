import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import sendAuthMetric, { AuthMetric } from '../metrics/auth'
import {
  validateAdminToken,
  validateAdminTokenOnHeader,
  validateApiToken,
  validateStoreToken,
} from './helper'

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
      } = context

      const {
        hasAdminToken,
        hasValidAdminToken,
        hasCurrentValidAdminToken,
        hasValidAdminTokenFromStore,
      } = await validateAdminToken(context, adminUserAuthToken as string)

      const {
        hasAdminTokenOnHeader,
        hasValidAdminTokenOnHeader,
        hasCurrentValidAdminTokenOnHeader,
      } = await validateAdminTokenOnHeader(context)

      const { hasApiToken, hasValidApiToken, hasValidApiTokenFromStore } =
        await validateApiToken(context)

      const { hasStoreToken, hasValidStoreToken, hasCurrentValidStoreToken } =
        await validateStoreToken(context, storeUserAuthToken as string)

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
          hasAdminToken,
          hasValidAdminToken,
          hasApiToken,
          hasValidApiToken,
          hasStoreToken,
          hasValidStoreToken,
          hasAdminTokenOnHeader,
          hasValidAdminTokenOnHeader,
          hasValidAdminTokenFromStore,
          hasValidApiTokenFromStore,
        },
        'CheckUserAccessAudit'
      )

      sendAuthMetric(logger, auditMetric)

      if (
        !hasAdminToken &&
        !hasApiToken &&
        !hasStoreToken &&
        !hasAdminTokenOnHeader
      ) {
        logger.warn({
          message: 'CheckUserAccess: No token provided',
          userAgent,
          caller,
          forwardedHost,
          operation,
          hasAdminToken,
          hasValidAdminToken,
          hasApiToken,
          hasValidApiToken,
          hasStoreToken,
          hasAdminTokenOnHeader,
          hasValidAdminTokenOnHeader,
          hasValidAdminTokenFromStore,
          hasValidApiTokenFromStore,
        })
        throw new AuthenticationError('No token was provided')
      }

      if (
        !hasCurrentValidAdminToken &&
        !hasValidApiToken &&
        !hasCurrentValidStoreToken &&
        !hasCurrentValidAdminTokenOnHeader
      ) {
        logger.warn({
          message: `CheckUserAccess: Invalid token`,
          userAgent,
          caller,
          forwardedHost,
          operation,
          hasAdminToken,
          hasValidAdminToken,
          hasApiToken,
          hasValidApiToken,
          hasStoreToken,
          hasValidStoreToken,
          hasAdminTokenOnHeader,
          hasValidAdminTokenOnHeader,
          hasValidAdminTokenFromStore,
          hasValidApiTokenFromStore,
        })
        throw new ForbiddenError('Unauthorized Access')
      }

      return resolve(root, args, context, info)
    }
  }
}
