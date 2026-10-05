/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import { checkUserPermission } from '../resolvers/Queries/Users'
import { describeClientError } from '../utils/clientError'

export class WithUserPermissions extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (root: any, args: any, context: any, info: any) => {
      const {
        clients: { session, logger },
      } = context

      context.vtex.sender = context?.graphql?.query?.senderApp ?? null
      context.vtex.sessionData = await session
        .getSession(context.vtex.sessionToken as string, ['*'])
        .then((currentSession: any) => {
          return currentSession.sessionData
        })
        .catch((error) => {
          logger.warn({
            error: describeClientError(error),
            message: 'withUserPermissions.getSessionError',
            operation: field.astNode?.name?.value ?? context.request.url,
          })

          return null
        })

      context.vtex.userPermissions = await checkUserPermission(
        null,
        { skipError: true },
        context
      )

      return resolve(root, args, context, info)
    }
  }
}
