/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-params */
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

export class WithSession extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (root: any, args: any, context: any, info: any) => {
      const {
        clients: { session },
      } = context

      const token =
        context.vtex.sessionToken ?? context.request.header?.sessiontoken

      context.vtex.sessionData = await session
        .getSession(token as string, ['*'])
        .then((currentSession: any) => {
          return currentSession.sessionData
        })
        .catch(() => null)

      return resolve(root, args, context, info)
    }
  }
}
