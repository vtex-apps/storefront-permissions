import { SchemaDirectiveVisitor } from 'graphql-tools'
import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'

import {
  validateAdminToken,
  validateAdminTokenOnHeader,
  validateApiToken,
} from './helper'
import { LICENSE_MANAGER_ROLES } from '../utils/constants'

export class ValidateAdminUserAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field
    const { adminPermission } = this.args

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      const {
        vtex: { adminUserAuthToken, logger },
      } = context

      const operation = field?.astNode?.name?.value ?? context?.request?.url
      const userAgent = context?.request?.headers['user-agent'] as string
      const caller = context?.request?.headers['x-vtex-caller'] as string
      const forwardedHost = context?.request?.headers[
        'x-forwarded-host'
      ] as string

      let metricFields: Record<string, unknown> = {
        operation,
        forwardedHost,
        caller,
        userAgent,
      }

      // Choose role based on parameter
      const requiredRole =
        adminPermission === 'B2B_ORGANIZATIONS_EDIT'
          ? LICENSE_MANAGER_ROLES.B2B_ORGANIZATIONS_EDIT
          : LICENSE_MANAGER_ROLES.B2B_ORGANIZATIONS_VIEW

      const { hasAdminToken, hasValidAdminToken } = await validateAdminToken(
        context,
        adminUserAuthToken as string,
        metricFields,
        requiredRole
      )

      metricFields = {
        ...metricFields,
        hasAdminToken,
        hasValidAdminToken,
      }

      // allow access if has valid admin token
      if (hasValidAdminToken) {
        return resolve(root, args, context, info)
      }

      // If there's no valid admin token on context, search for it on header
      const { hasAdminTokenOnHeader, hasValidAdminTokenOnHeader } =
        await validateAdminTokenOnHeader(context, metricFields, requiredRole)

      metricFields = {
        ...metricFields,
        hasAdminTokenOnHeader,
        hasValidAdminTokenOnHeader,
      }

      // allow access if has valid admin token
      if (hasValidAdminTokenOnHeader) {
        return resolve(root, args, context, info)
      }

      const { hasApiToken, hasValidApiToken } = await validateApiToken(
        context,
        metricFields,
        requiredRole
      )

      metricFields = {
        ...metricFields,
        hasApiToken,
        hasValidApiToken,
      }

      // allow access if has valid API token
      if (hasValidApiToken) {
        return resolve(root, args, context, info)
      }

      // deny access if no tokens were provided
      if (!hasAdminToken && !hasAdminTokenOnHeader && !hasApiToken) {
        logger.warn({
          message: 'ValidateAdminUserAccess: No token provided',
          ...metricFields,
        })
        throw new AuthenticationError('No token was provided')
      }

      // deny access if no valid tokens were provided
      logger.warn({
        message: 'ValidateAdminUserAccess: Invalid token',
        ...metricFields,
      })
      throw new ForbiddenError('Unauthorized Access')
    }
  }
}
