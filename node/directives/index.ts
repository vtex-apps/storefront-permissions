import { WithSession } from './withSession'
import { WithSender } from './withSender'
import { WithUserPermissions } from './withUserPermissions'

export const schemaDirectives = {
  withSession: WithSession,
  withSender: WithSender,
  withUserPermissions: WithUserPermissions,
}
