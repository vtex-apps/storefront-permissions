import { defaultFieldResolver, GraphQLField } from 'graphql'
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
