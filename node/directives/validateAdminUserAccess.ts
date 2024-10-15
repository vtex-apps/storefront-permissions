import { SchemaDirectiveVisitor } from 'graphql-tools'
import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'

import type { AuthAuditMetric } from '../metrics/auth'
import sendAuthMetric, { AuthMetric } from '../metrics/auth'
import {
  validateAdminToken,
  validateAdminTokenOnHeader,
  validateApiToken,
} from './helper'

export class ValidateAdminUserAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field
    const { orgPermission } = this.args

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      const {
        vtex: { adminUserAuthToken, logger },
      } = context

      // get metrics data
      const operation = field?.astNode?.name?.value ?? context?.request?.url
      const userAgent = context?.request?.headers['user-agent'] as string
      const caller = context?.request?.headers['x-vtex-caller'] as string
      const forwardedHost = context?.request?.headers[
        'x-forwarded-host'
      ] as string

      // set metric fields with initial data
      let metricFields: AuthAuditMetric = {
        operation,
        forwardedHost,
        caller,
        userAgent,
      }

      const { hasAdminToken, hasValidAdminToken } = await validateAdminToken(
        context,
        adminUserAuthToken as string,
        metricFields,
        orgPermission
      )

      // add admin token metrics
      metricFields = {
        ...metricFields,
        hasAdminToken,
        hasValidAdminToken,
      }

      // allow access if has valid admin token
      if (hasValidAdminToken) {
        sendAuthMetric(
          logger,
          new AuthMetric(
            context?.vtex?.account,
            metricFields,
            'ValidateAdminUserAccessAudit'
          )
        )

        return resolve(root, args, context, info)
      }

      // If there's no valid admin token on context, search for it on header
      const { hasAdminTokenOnHeader, hasValidAdminTokenOnHeader } =
        await validateAdminTokenOnHeader(context, metricFields)

      // add admin header token metrics
      metricFields = {
        ...metricFields,
        hasAdminTokenOnHeader,
        hasValidAdminTokenOnHeader,
      }

      // allow access if has valid admin token
      if (hasValidAdminTokenOnHeader) {
        sendAuthMetric(
          logger,
          new AuthMetric(
            context?.vtex?.account,
            metricFields,
            'ValidateAdminUserAccessAudit'
          )
        )

        return resolve(root, args, context, info)
      }

      const { hasApiToken, hasValidApiToken } = await validateApiToken(
        context,
        metricFields
      )

      // add API token metrics
      metricFields = {
        ...metricFields,
        hasApiToken,
        hasValidApiToken,
      }

      // allow access if has valid API token
      if (hasValidApiToken) {
        sendAuthMetric(
          logger,
          new AuthMetric(
            context?.vtex?.account,
            metricFields,
            'ValidateAdminUserAccessAudit'
          )
        )

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
