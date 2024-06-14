import { WithSession } from './withSession'
import { WithSender } from './withSender'
import { WithUserPermissions } from './withUserPermissions'
import { CheckAdminAccess } from './checkAdminAccess'
import { CheckUserAccess } from './checkUserAccess'
import { ValidateUserAccess } from './validateUserAccess'
import { AuditAccess } from './auditAccess'

export const schemaDirectives = {
  checkAdminAccess: CheckAdminAccess as any,
  checkUserAccess: CheckUserAccess as any,
  validateUserAccess: ValidateUserAccess as any,
  withSession: WithSession,
  withSender: WithSender,
  withUserPermissions: WithUserPermissions,
  auditAccess: AuditAccess as any,
}
