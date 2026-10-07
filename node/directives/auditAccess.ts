import type { GraphQLField } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

/**
 * Previously emitted unused auth analytics via sendAuthMetric.
 * Kept as a no-op so @auditAccess remains valid in the schema (B2BTEAM-3839).
 */
export class AuditAccess extends SchemaDirectiveVisitor {
  public visitFieldDefinition(_field: GraphQLField<any, any>) {
    // no-op
  }
}
