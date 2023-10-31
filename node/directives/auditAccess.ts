import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import sendAuthMetric, { AuthMetric } from '../metrics/auth'
import { checkUserPermission } from '../resolvers/Queries/Users'

export class AuditAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      const {
        vtex: { adminUserAuthToken, storeUserAuthToken, account, logger },
        request,
      } = context

      const operation = field.astNode?.name?.value ?? request.url
      const forwardedHost = request.headers['x-forwarded-host'] as string
      const caller = request.headers['x-vtex-caller'] as string

      const hasAdminToken = !!(
        adminUserAuthToken ?? (context?.headers.vtexidclientautcookie as string)
      )

      const hasStoreToken = !!storeUserAuthToken
      const hasApiToken = !!request.headers['vtex-api-apptoken']

      let role
      let permissions = []

      if (hasAdminToken || hasStoreToken) {
        const checkUserPermissions = await checkUserPermission(
          null,
          { skipError: true },
          context
        )

        role = checkUserPermissions.role.slug
        permissions = checkUserPermissions.permissions
      }

      const authMetric = new AuthMetric(account, {
        caller,
        forwardedHost,
        hasAdminToken,
        hasApiToken,
        hasStoreToken,
        operation,
        permissions,
        role,
      })

      sendAuthMetric(logger, authMetric)

      return resolve(root, args, context, info)
    }
  }
}
