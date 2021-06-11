import { defaultFieldResolver, GraphQLField } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

export class WithSession extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field
    field.resolve = async (root: any, args: any, context: any, info: any) => {
      const {
        clients: {
          session
        }
      } = context

      context.vtex.sessionData = await session.getSession(context.vtex.sessionToken as string, ['*'])
      .then((currentSession: any) => {
        return currentSession.sessionData
      }).catch(() => null)


      return resolve(root, args, context, info)
    }
  }
}
