import { AuthenticationError, ForbiddenError } from '@vtex/api'
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

export async function checkUserOrAdminTokenAccess(
  ctx: Context,
  operation?: string
) {
  const {
    vtex: { adminUserAuthToken, storeUserAuthToken, logger },
    clients: { identity, vtexId },
  } = ctx

  if (!adminUserAuthToken && !storeUserAuthToken) {
    logger.warn({
      message: `CheckUserAccess: No admin or store token was provided for ${operation}`,
      operation,
    })
    throw new AuthenticationError('No admin or store token was provided')
  }

  if (adminUserAuthToken) {
    try {
      await identity.validateToken({ token: adminUserAuthToken })
    } catch (err) {
      logger.warn({
        error: err,
        message: `CheckUserAccess: Invalid admin token for ${operation}`,
        operation,
        token: adminUserAuthToken,
      })
      throw new ForbiddenError('Unauthorized Access')
    }
  } else if (storeUserAuthToken) {
    let authUser = null

    try {
      authUser = await vtexId.getAuthenticatedUser(storeUserAuthToken)
      if (!authUser?.user) {
        logger.warn({
          message: `CheckUserAccess: No valid user found by store user token for ${operation}`,
          operation,
        })
        authUser = null
      }
    } catch (err) {
      logger.warn({
        error: err,
        message: `CheckUserAccess: Invalid store user token for ${operation}`,
        operation,
        token: adminUserAuthToken,
      })
      authUser = null
    }

    if (!authUser) {
      throw new ForbiddenError('Unauthorized Access')
    }
  }
}

export class CheckUserAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (
      root: any,
      args: any,
      context: Context,
      info: any
    ) => {
      const operationName = field.astNode?.name?.value

      await checkUserOrAdminTokenAccess(context, operationName)

      return resolve(root, args, context, info)
    }
  }
}
