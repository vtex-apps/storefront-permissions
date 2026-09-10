/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  readActiveSelection,
  resolveSelectionKey,
  writeActiveSelection,
} from '../services/activeSelection'
import { ACTIVE_SELECTION_DATA_ENTITY } from '../utils/constants'

const makeCtx = () => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

  return {
    clients: {
      masterDataExtended: {
        getDocumentById: jest.fn(),
        putDocumentById: jest.fn().mockResolvedValue(undefined),
      },
    },
    vtex: { account: 'testacc', logger },
  } as any
}

const complete = { b2bUserId: 'rec-1', costId: 'CC-A', orgId: 'ORG-A' }

/**
 * The key has to name the person, not the record. A `b2b_users` id is per
 * (person x organization x cost center), so a shopper with three organizations
 * has three of them and none of them identifies the shopper.
 */
describe('resolveSelectionKey', () => {
  it('uses the signed-in shopper when nobody is impersonating', () => {
    expect(resolveSelectionKey({ sessionStoreUserId: 'shopper-1' })).toBe(
      'shopper-1'
    )
  })

  /**
   * During impersonation `authentication.storeUserId` is the operator, so
   * keying on it would file the shopper's selection under whoever is
   * impersonating them - and hand the operator's own selection back to the
   * shopper on the next transform.
   */
  it('prefers the impersonated shopper over the operator', () => {
    expect(
      resolveSelectionKey({
        b2bImpersonatedUserId: 'impersonated-1',
        sessionStoreUserId: 'operator-1',
      })
    ).toBe('impersonated-1')

    expect(
      resolveSelectionKey({
        sessionStoreUserId: 'operator-1',
        telemarketingUserId: 'impersonated-2',
      })
    ).toBe('impersonated-2')
  })

  it('puts the B2B impersonation ahead of the telemarketing one', () => {
    expect(
      resolveSelectionKey({
        b2bImpersonatedUserId: 'b2b-1',
        sessionStoreUserId: 'operator-1',
        telemarketingUserId: 'tele-1',
      })
    ).toBe('b2b-1')
  })

  it('answers null when nothing identifies a shopper', () => {
    expect(resolveSelectionKey({})).toBeNull()
    expect(resolveSelectionKey({ sessionStoreUserId: '' })).toBeNull()
  })
})

describe('readActiveSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the recorded selection', async () => {
    const ctx = makeCtx()

    ctx.clients.masterDataExtended.getDocumentById.mockResolvedValue(complete)

    expect(await readActiveSelection(ctx, 'shopper-1')).toEqual(complete)
    expect(ctx.clients.masterDataExtended.getDocumentById).toHaveBeenCalledWith(
      ACTIVE_SELECTION_DATA_ENTITY,
      'shopper-1',
      expect.arrayContaining(['b2bUserId', 'orgId', 'costId'])
    )
  })

  /**
   * Master Data answers HTTP 200 with a zero-length body for all three of
   * these - verified against a live account, byte-identical responses - so one
   * branch has to cover them and there is no 404 to catch. The empty string in
   * particular is falsy but not nullish, which is why the guard cannot use
   * `??`: `'' ?? fallback` keeps the empty string.
   */
  it.each([
    ['an empty body (entity or document missing)', ''],
    ['no body at all', undefined],
    ['an explicit null', null],
  ])('answers null for %s', async (_label, response) => {
    const ctx = makeCtx()

    ctx.clients.masterDataExtended.getDocumentById.mockResolvedValue(response)

    expect(await readActiveSelection(ctx, 'shopper-1')).toBeNull()
  })

  it('answers null for a half-written document rather than a partial selection', async () => {
    const ctx = makeCtx()

    ctx.clients.masterDataExtended.getDocumentById.mockResolvedValue({
      orgId: 'ORG-A',
    })

    expect(await readActiveSelection(ctx, 'shopper-1')).toBeNull()
  })

  /**
   * The search path still exists behind this. A failure here has to degrade to
   * it, never fail the transform.
   */
  it('answers null and does not throw when Master Data fails', async () => {
    const ctx = makeCtx()

    ctx.clients.masterDataExtended.getDocumentById.mockRejectedValue(
      new Error('master data down')
    )

    expect(await readActiveSelection(ctx, 'shopper-1')).toBeNull()
    expect(ctx.vtex.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'readActiveSelection.error' })
    )
  })
})

describe('writeActiveSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('writes the selection under the shopper key, with no schema', async () => {
    const ctx = makeCtx()

    expect(await writeActiveSelection(ctx, 'shopper-1', complete)).toBe(true)

    const [entity, key, fields] =
      ctx.clients.masterDataExtended.putDocumentById.mock.calls[0]

    expect(entity).toBe(ACTIVE_SELECTION_DATA_ENTITY)
    expect(key).toBe('shopper-1')
    expect(fields).toMatchObject(complete)
    expect(fields.updatedAt).toEqual(expect.any(String))
  })

  /**
   * `b2b_users.active` stays the durable truth; this only records which
   * document to read. A failed write must not fail a switch that otherwise
   * succeeded - the next transform falls back to the search.
   */
  it('reports failure without throwing when the write fails', async () => {
    const ctx = makeCtx()

    ctx.clients.masterDataExtended.putDocumentById.mockRejectedValue(
      new Error('master data down')
    )

    expect(await writeActiveSelection(ctx, 'shopper-1', complete)).toBe(false)
    expect(ctx.vtex.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'writeActiveSelection.error' })
    )
  })
})
