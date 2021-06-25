/* eslint-disable max-params */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

export class WithSender extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (root: any, args: any, context: any, info: any) => {
      context.vtex.sender = context?.graphql?.query?.senderApp ?? null

      return resolve(root, args, context, info)
    }
  }
}
