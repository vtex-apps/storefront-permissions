export const CUSTOMER_SCHEMA_NAME = 'CL'

// Entity + schema versions owned by vtex.b2b-organizations-graphql (node/mdSchema.ts).
export const COST_CENTER_DATA_ENTITY = 'cost_centers'
export const COST_CENTER_SCHEMA_VERSION = 'v0.0.8'
export const COST_CENTER_FIELDS = [
  'id',
  'name',
  'addresses',
  'paymentTerms',
  'organization',
  'phoneNumber',
  'businessDocument',
  'stateRegistration',
  'sellers',
]
export const ORGANIZATION_DATA_ENTITY = 'organizations'
export const ORGANIZATION_SCHEMA_VERSION = 'v0.0.8'
export const ORGANIZATION_FIELDS = [
  'id',
  'name',
  'tradeName',
  'status',
  'priceTables',
  'salesChannel',
  'collections',
  'sellers',
]
export const CUSTOMER_REQUIRED_FIELDS = [
  'email',
  'id',
  'accountId',
  'accountName',
  'dataEntityId',
]
export const ROLES_VBASE_ID = 'allRolesVbId'

// License Manager constants
export const B2B_ORGANIZATIONS_PRODUCT_ID = 97
export const B2B_LM_PRODUCT_CODE = B2B_ORGANIZATIONS_PRODUCT_ID
export const BUYER_ORGANIZATION_VIEW_ROLE = 'buyer_organization_view'
export const BUYER_ORGANIZATION_EDIT_ROLE = 'buyer_organization_edit'

// License Manager roles object
export const LICENSE_MANAGER_ROLES = {
  B2B_ORGANIZATIONS_VIEW: BUYER_ORGANIZATION_VIEW_ROLE,
  B2B_ORGANIZATIONS_EDIT: BUYER_ORGANIZATION_EDIT_ROLE,
}

// Role constants for GraphQL directives
export const B2B_ORGANIZATIONS_EDIT_ROLE_PARAM = 'B2B_ORGANIZATIONS_EDIT'
