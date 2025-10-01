export const CUSTOMER_SCHEMA_NAME = 'CL'
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
