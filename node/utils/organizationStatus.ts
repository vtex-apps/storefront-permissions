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
 * exactly instead of hand-rolling the comparison at each call site - a looser
 * check such as `!== 'inactive'` would let `on-hold` organizations through.
 */
export const ORGANIZATION_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ON_HOLD: 'on-hold',
} as const

const KNOWN_STATUSES: string[] = Object.values(ORGANIZATION_STATUSES)

/**
 * Only an active organization may be used, matching `checkOrganizationIsActive`.
 */
export const isOrganizationUsable = (status?: string | null): boolean =>
  status === ORGANIZATION_STATUSES.ACTIVE

/**
 * Divergence cannot be prevented structurally without paying for the app hop, so
 * make it loud: a status introduced upstream shows up in the logs instead of
 * silently falling into the "not usable" branch. Unknown statuses are still
 * treated as unusable by `isOrganizationUsable`, which fails closed.
 */
export const isKnownOrganizationStatus = (status?: string | null): boolean =>
  typeof status === 'string' && KNOWN_STATUSES.includes(status)
