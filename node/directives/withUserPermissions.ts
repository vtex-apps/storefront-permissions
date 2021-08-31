/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-params */
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import { checkUserPermission } from '../resolvers/Queries/Users'

export class WithUserPermissions extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (root: any, args: any, context: any, info: any) => {
      const {
        clients: { session },
      } = context

      context.vtex.sender = context?.graphql?.query?.senderApp ?? null
      context.vtex.sessionData = await session
        .getSession(context.vtex.sessionToken as string, ['*'])
        .then((currentSession: any) => {
          return currentSession.sessionData
        })
        .catch(() => null)

      context.vtex.userPermissions = await checkUserPermission(
        null,
        null,
        context
      )

      return resolve(root, args, context, info)
    }
  }
}
