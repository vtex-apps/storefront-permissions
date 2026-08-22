export const CUSTOMER_SCHEMA_NAME = 'CL'
export const CUSTOMER_REQUIRED_FIELDS = [
  'email',
  'id',
  'accountId',
  'accountName',
  'dataEntityId',
]
export const ROLES_VBASE_ID = 'allRolesVbId'

/**
 * Caching for the session transform. This route runs several times during a
 * single storefront navigation, so every avoided round-trip counts.
 *
 * Two rules of thumb:
 * - Add the cross-pod VBase layer only when the origin is expensive (Apps API,
 *   Master Data, another app's GraphQL). For data that already lives in VBase,
 *   an in-memory layer is the only thing that helps.
 * - Keep the TTL short for anything an operator flips or a user changes.
 */
// Shared VBase bucket for cross-pod stale-while-revalidate caches
export const VBASE_CACHE_BUCKET = 'sfp-cache'

// Sales channel list changes very rarely, so it can be cached aggressively.
export const SALES_CHANNEL_CACHE_TTL_IN_MINUTES = 6 * 60
export const SALES_CHANNEL_MEMORY_CACHE_TTL_IN_MS = 5 * 60 * 1000

/**
 * App settings are feature flags an operator may flip, so keep this short:
 * effective propagation delay is roughly this TTL plus the in-memory TTL.
 */
export const APP_SETTINGS_CACHE_TTL_IN_MINUTES = 5

// In-memory only (VBase-sourced), and short: this flag is a kill switch.
export const SESSION_WATCHER_CACHE_TTL_IN_MS = 60 * 1000

/**
 * In-memory only (VBase-sourced). Deliberately short: this is authorization
 * data and role mutations cannot invalidate other pods' caches, so the TTL is
 * the upper bound on how long a permission revoked in the admin stays
 * effective.
 */
export const ROLES_CACHE_TTL_IN_MS = 60 * 1000

/**
 * Resolves the *active* organization of a user. The cache key includes the
 * session's `public.b2bCurrentCostCenter`, which `setCurrentOrganization` writes
 * on every organization switch, so a switch changes the key and misses the cache
 * instead of reading a stale entry. That makes key-based invalidation exact and
 * lets the TTL be generous.
 *
 * The TTL is only a safety net for changes that do *not* go through that
 * mutation, such as an admin editing the user's organizations directly.
 * Set `sessionUserCacheTtlMs` to 0 to disable.
 */
export const ACTIVE_USER_CACHE_TTL_IN_MS = 5 * 60 * 1000
export const ACTIVE_USER_CACHE_TTL_IN_MINUTES = 5

/**
 * Variant used by permission checks, which have no session cost center to key
 * on, so an organization switch cannot invalidate by key. Kept memory-only and
 * short so stale permissions are bounded to this window.
 */
export const PERMISSIONS_USER_CACHE_TTL_IN_MS = 60 * 1000

/**
 * The region lookup is a deterministic function of country, postal code, sales
 * channel and geo coordinates, so it caches cleanly on those. It only goes stale
 * when the merchant changes logistics configuration.
 */
export const REGION_CACHE_TTL_IN_MS = 30 * 60 * 1000
export const REGION_CACHE_TTL_IN_MINUTES = 30

// Account-level B2B settings, edited from the admin only.
export const B2B_SETTINGS_CACHE_TTL_IN_MS = 5 * 60 * 1000
export const B2B_SETTINGS_CACHE_TTL_IN_MINUTES = 5

/**
 * Organization and cost center data (status, price tables, sales channel,
 * addresses) is admin-edited and was measured as the most expensive remaining
 * step. TTLs are kept to a minute because deactivating an organization should
 * take effect quickly.
 */
export const ORGANIZATION_CACHE_TTL_IN_MS = 60 * 1000
export const ORGANIZATION_CACHE_TTL_IN_MINUTES = 2

/**
 * Cost center documents were measured between roughly 400B and 29KB, because the
 * addresses list varies wildly, so this cache is bounded by bytes instead of by
 * entry count. Organization documents measured 187B to 480B, a tight enough
 * spread that a plain entry count is predictable.
 */
export const COST_CENTER_CACHE_MAX_SIZE_BYTES = 8 * 1024 * 1024

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
