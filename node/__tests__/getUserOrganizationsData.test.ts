import { getUserOrganizationsData } from '../resolvers/Routes/utils'

const makeCtx = (records: any[], account = 'acc'): any => ({
  clients: {
    organizations: {
      getOrganizationsPaginatedByEmail: jest.fn().mockResolvedValue({
        data: {
          getOrganizationsPaginatedByEmail: {
            data: records,
            pagination: { page: 1, pageSize: 200, total: records.length },
          },
        },
      }),
    },
  },
  vtex: {
    account,
    logger: { error: jest.fn(), warn: jest.fn() },
    workspace: 'master',
  },
})

const record = (overrides: Record<string, unknown>) => ({
  costCenterName: 'CC',
  costId: 'cc1',
  id: 'r1',
  orgId: 'org1',
  organizationStatus: 'active',
  ...overrides,
})

// The module keeps a per-email in-memory cache, so each test uses its own
// email to stay isolated.
let uniq = 0
const nextEmail = () => `buyer${uniq++}@test.com`

describe('getUserOrganizationsData', () => {
  it('only nominates a record whose organization AND cost center are usable together', async () => {
    // An active organization whose cost center was deleted must not be
    // adopted: its costId is what gets stamped on the session, so the pair
    // would be broken. The usable pair further down the list wins.
    const ctx = makeCtx([
      record({ costCenterName: null, costId: 'ccGone', id: 'rA', orgId: 'orgA' }),
      record({ costId: 'ccB', id: 'rB', orgId: 'orgB' }),
    ])

    const result = await getUserOrganizationsData(nextEmail(), ctx, false)

    expect(result.activeOrganization).toMatchObject({
      costId: 'ccB',
      orgId: 'orgB',
    })
  })

  it('nominates nothing when no record pairs a usable organization with a live cost center', async () => {
    // One record has the organization, the other has the cost center - but no
    // single record has both, and the costId comes from the nominated record.
    const ctx = makeCtx([
      record({ costCenterName: null, id: 'rA', orgId: 'orgA' }),
      record({ id: 'rB', organizationStatus: 'inactive', orgId: 'orgB' }),
    ])

    const result = await getUserOrganizationsData(nextEmail(), ctx, false)

    expect(result.activeOrganization).toBeNull()
    // The valid cost center is still reported for the invalid-cost-center path.
    expect(result.validCostCenterId).toBe('cc1')
  })

  it('does not treat an on-hold organization as usable', async () => {
    const ctx = makeCtx([record({ organizationStatus: 'on-hold' })])

    const result = await getUserOrganizationsData(nextEmail(), ctx, false)

    expect(result.activeOrganization).toBeNull()
  })

  it('never serves one tenant the cached organizations of another', async () => {
    // A pod serves multiple accounts and this cache is a module-level Map, so
    // the key must be tenant-scoped: the same email can exist in two accounts
    // with entirely different organizations.
    const email = nextEmail()
    const ctxA = makeCtx([record({ costId: 'ccA', orgId: 'orgA' })], 'accA')
    const ctxB = makeCtx([record({ costId: 'ccB', orgId: 'orgB' })], 'accB')

    const first = await getUserOrganizationsData(email, ctxA, true)
    const second = await getUserOrganizationsData(email, ctxB, true)

    expect(first.activeOrganization).toMatchObject({ orgId: 'orgA' })
    expect(second.activeOrganization).toMatchObject({ orgId: 'orgB' })
    // And the second call must have hit its own origin, not account A's cache.
    expect(
      ctxB.clients.organizations.getOrganizationsPaginatedByEmail
    ).toHaveBeenCalled()
  })
})
