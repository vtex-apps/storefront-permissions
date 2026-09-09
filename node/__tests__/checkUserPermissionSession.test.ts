/* eslint-disable @typescript-eslint/no-explicit-any */
import { checkUserPermission } from '../resolvers/Queries/Users'

const makeCtx = ({
  sessionData,
  sessionToken,
}: { sessionData?: any; sessionToken?: string } = {}) => {
  const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() }

  return {
    clients: {},
    vtex: { account: 'testacc', logger, sessionData, sessionToken },
  } as any
}

const warning = (ctx: any) =>
  ctx.vtex.logger.warn.mock.calls.find(
    (call: any[]) =>
      call[0]?.message === 'checkUserPermission-sessionUnavailable'
  )?.[0]

const trace = (ctx: any) =>
  ctx.vtex.logger.info.mock.calls.find(
    (call: any[]) => call[0]?.message === 'checkUserPermission.timings'
  )?.[0]

/**
 * This branch tests whether the session could be read, never whether the
 * shopper is signed in - the old `userNotAuthenticated` name said the
 * opposite and sent B2BTEAM-3852 down the wrong path for weeks. Three
 * captures show the browser holding a complete, authenticated session at the
 * moment it fired, with `getOrganizationsForSelector` answering from the
 * store-token fallback in the very same request.
 */
describe('checkUserPermission when the session does not reach the resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports the reason as a session problem, not an authentication one', async () => {
    const ctx = makeCtx({ sessionToken: 'token' })

    await expect(checkUserPermission(null, {}, ctx)).rejects.toThrow(
      'User not authenticated'
    )

    expect(trace(ctx)).toMatchObject({ reason: 'sessionUnavailable' })
  })

  /**
   * The two explanations need different owners: no token means the request
   * never carried a session, a token with nothing behind it means the session
   * service returned empty for a valid one.
   */
  it('separates a request with no token from a token that resolved to nothing', async () => {
    const withToken = makeCtx({ sessionToken: 'token' })

    await expect(checkUserPermission(null, {}, withToken)).rejects.toBeDefined()
    expect(warning(withToken)).toMatchObject({ hasSessionToken: true })

    const withoutToken = makeCtx()

    await expect(
      checkUserPermission(null, {}, withoutToken)
    ).rejects.toBeDefined()
    expect(warning(withoutToken)).toMatchObject({ hasSessionToken: false })
  })

  it('distinguishes no session at all from a session that arrived without namespaces', async () => {
    const noSession = makeCtx({ sessionToken: 'token' })

    await expect(checkUserPermission(null, {}, noSession)).rejects.toBeDefined()
    expect(warning(noSession).sessionKeys).toEqual([])

    const partial = makeCtx({
      sessionData: { id: 'session-1' },
      sessionToken: 'token',
    })

    await expect(checkUserPermission(null, {}, partial)).rejects.toBeDefined()
    expect(warning(partial).sessionKeys).toEqual(['id'])
  })

  it('stays quiet when the caller opted out of the error', async () => {
    const ctx = makeCtx({ sessionToken: 'token' })

    await checkUserPermission(null, { skipError: true }, ctx).catch(
      () => undefined
    )

    expect(warning(ctx)).toBeUndefined()
  })
})
