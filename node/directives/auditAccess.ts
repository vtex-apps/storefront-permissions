import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import sendAuthMetric, { AuthMetric } from '../metrics/auth'

export class AuditAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      this.sendAuthMetric(field, context)

      return resolve(root, args, context, info)
    }
  }

  private async sendAuthMetric(field: GraphQLField<any, any>, context: any) {
    const {
      vtex: { adminUserAuthToken, storeUserAuthToken, account, logger },
      request,
    } = context

    const operation = field.astNode?.name?.value ?? request.url
    const userAgent = request.headers['user-agent'] as string
    const forwardedHost = request.headers['x-forwarded-host'] as string
    const caller =
      context.vtex.sender ?? (request.headers['x-vtex-caller'] as string)

    const hasAdminToken = !!(
      adminUserAuthToken ?? (context?.headers.vtexidclientautcookie as string)
    )

    const hasStoreToken = !!storeUserAuthToken
    const hasApiToken = !!request.headers['vtex-api-apptoken']

    const authMetric = new AuthMetric(account, {
      caller,
      userAgent,
      forwardedHost,
      hasAdminToken,
      hasApiToken,
      hasStoreToken,
      operation,
    })

    await sendAuthMetric(logger, authMetric)
  }
}
