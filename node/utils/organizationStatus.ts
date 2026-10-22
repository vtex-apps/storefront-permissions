/**
 * Organization lifecycle status.
 *
 * `b2b-organizations-graphql` owns this vocabulary (its `ORGANIZATION_STATUSES`
 * constant and its GraphQL schema declare the canonical values) and its own
 * `checkOrganizationIsActive` resolver answers `status === 'active'` - only an
 * active organization may be used.
 *
 * This app reads the organization document straight from Master Data rather than
 * through that app's GraphQL, because the extra app hop was measured at roughly
 * 1.4s on top of the ~0.4s document read, with samples past 2.2s - the session
 * transform's whole budget. The trade-off is that the status rule lives in two
 * places, so keep it in this single module and mirror the owner's semantics
 * consistently instead of hand-rolling the comparison at each call site (see
 * `isOrganizationUsable` for why the session rule is deliberately looser than
 * the owner's `checkOrganizationIsActive`).
 */
export const ORGANIZATION_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ON_HOLD: 'on-hold',
} as const

const KNOWN_STATUSES: string[] = Object.values(ORGANIZATION_STATUSES)

/**
 * Whether the session may be stamped with this organization.
 *
 * INC-6700: only an explicitly `inactive` organization is refused, which is
 * what this app did up to 3.6.x. 3.8.x refused everything but `active`, and
 * since the refusal silently relocates the shopper (recovery) instead of
 * failing, a switch into an `on-hold` organization - or one with a status this
 * app does not know, or none at all - reported success and left the shopper in
 * another organization.
 *
 * This is not the access gate for the organization's data:
 * b2b-organizations-graphql still answers `checkOrganizationIsActive` with
 * `status === 'active'` and refuses its storefront cost-center queries for any
 * other status, so non-active organizations stay restricted where that rule
 * is owned. Unknown statuses keep being reported (`isKnownOrganizationStatus`).
 */
export const isOrganizationUsable = (status?: string | null): boolean =>
  status !== ORGANIZATION_STATUSES.INACTIVE

/**
 * Divergence cannot be prevented structurally without paying for the app hop, so
 * make it loud: a status introduced upstream shows up in the logs instead of
 * silently changing behavior. Unknown statuses are served (3.6.x semantics, see
 * `isOrganizationUsable`) and reported.
 */
export const isKnownOrganizationStatus = (status?: string | null): boolean =>
  typeof status === 'string' && KNOWN_STATUSES.includes(status)
