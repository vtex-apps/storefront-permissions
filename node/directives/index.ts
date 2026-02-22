import { WithSession } from './withSession'
import { WithSender } from './withSender'
import { WithUserPermissions } from './withUserPermissions'
import { CheckAdminAccess } from './checkAdminAccess'
import { CheckUserAccess } from './checkUserAccess'
import { ValidateAdminUserAccess } from './validateAdminUserAccess'
import { ValidateStoreUserAccess } from './validateStoreUserAccess'
import { AuditAccess } from './auditAccess'

export const schemaDirectives = {
  checkAdminAccess: CheckAdminAccess as any,
  checkUserAccess: CheckUserAccess as any,
  validateAdminUserAccess: ValidateAdminUserAccess as any,
  validateStoreUserAccess: ValidateStoreUserAccess as any,
  withSession: WithSession,
  withSender: WithSender,
  withUserPermissions: WithUserPermissions,
  auditAccess: AuditAccess as any,
}
