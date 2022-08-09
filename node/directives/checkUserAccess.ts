import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

export class CheckUserAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      const {
        vtex: { adminUserAuthToken, storeUserAuthToken, logger },
        clients: { identity, vtexId },
      } = context

      if (!adminUserAuthToken && !storeUserAuthToken) {
        throw new AuthenticationError('No admin or store token was provided')
      }

      if (adminUserAuthToken) {
        try {
          await identity.validateToken({ token: adminUserAuthToken })
        } catch (err) {
          logger.warn({
            error: err,
            message: 'CheckUserAccess: Invalid admin token',
            token: adminUserAuthToken,
          })
          throw new ForbiddenError('Unauthorized Access')
        }
      } else if (storeUserAuthToken) {
        let authUser = null

        try {
          authUser = await vtexId.getAuthenticatedUser(storeUserAuthToken)
          if (!authUser?.user) {
            authUser = null
          }
        } catch (err) {
          logger.warn({
            error: err,
            message: 'CheckUserAccess: Invalid store user token',
            token: adminUserAuthToken,
          })
          authUser = null
        }

        if (!authUser) {
          throw new ForbiddenError('Unauthorized Access')
        }
      }

      return resolve(root, args, context, info)
    }
  }
}
