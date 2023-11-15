import { WithSession } from './withSession'
import { WithSender } from './withSender'
import { WithUserPermissions } from './withUserPermissions'
import { CheckAdminAccess } from './checkAdminAccess'
import { CheckUserAccess } from './checkUserAccess'
import { AuditAccess } from './auditAccess'
import { CheckAccessWithFeatureFlag } from './checkAccessWithFeatureFlag'

export const schemaDirectives = {
  checkAccessWithFeatureFlag: CheckAccessWithFeatureFlag as any,
  checkAdminAccess: CheckAdminAccess as any,
  checkUserAccess: CheckUserAccess as any,
  withSession: WithSession,
  withSender: WithSender,
  withUserPermissions: WithUserPermissions,
  auditAccess: AuditAccess as any,
}
