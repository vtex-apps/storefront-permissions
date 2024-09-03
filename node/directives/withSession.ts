/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-params */
import type { GraphQLField } from 'graphql'
import { defaultFieldResolver } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

import sendSessionMetric, { SessionMetric } from '../metrics/session'

export class WithSession extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field

    field.resolve = async (root: any, args: any, context: any, info: any) => {
      const {
        clients: { session, logger },
      } = context

      const token =
        context.vtex.sessionToken ?? context.request.header?.sessiontoken

      context.vtex.sessionData = await session
        .getSession(token as string, ['*'])
        .then((currentSession: any) => {
          return currentSession.sessionData
        })
        .catch(() => null)

      // we emit a metric for cases where the sessionData is null
      // so we can identify use cases that are supposed to have sessionData
      // but do not have it. We currently have a high volume of logs generated
      // by such cases, so we need to identify and fix them.
      const operation = field.astNode?.name?.value ?? context.request.url
      const userAgent = context?.request?.headers['user-agent'] as string
      const caller = context?.request?.headers['x-vtex-caller'] as string
      const forwardedHost = context?.request?.headers[
        'x-forwarded-host'
      ] as string

      const hasSessionToken = !!context.vtex.sessionToken
      const hasSessionTokenOnHeader = !!context.request.header?.sessiontoken
      const hasSessionData = !!context.vtex.sessionData

      const auditMetric = new SessionMetric(context?.vtex?.account, {
        operation,
        forwardedHost,
        caller,
        userAgent,
        hasSessionToken,
        hasSessionTokenOnHeader,
        hasSessionData,
      })

      sendSessionMetric(logger, auditMetric)

      return resolve(root, args, context, info)
    }
  }
}
