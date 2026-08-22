import { collectCacheStats, createCachedResource } from '../services/cache'

const flush = () => new Promise((resolve) => setImmediate(resolve))

let uniq = 0

const makeCtx = (account: string, vbaseStored: unknown = null) =>
  ({
    clients: {
      vbase: {
        getJSON: jest.fn().mockResolvedValue(vbaseStored),
        saveJSON: jest.fn().mockResolvedValue(undefined),
      },
    },
    vtex: { account, workspace: 'master' },
  } as any)

// Each test gets its own resource: caches are module-level singletons keyed by
// name, so reusing names across tests would leak state.
const makeResource = (options: any) =>
  createCachedResource<any>(`test-${uniq++}`, options)

describe('createCachedResource', () => {
  it('serves repeated reads from memory without refetching', async () => {
    const cached = makeResource({ memoryTtlMs: 60000 })
    const ctx = makeCtx('acc1')
    const fetcher = jest.fn().mockResolvedValue({ v: 1 })

    expect(await cached(ctx, 'k', fetcher)).toEqual({ v: 1 })
    expect(await cached(ctx, 'k', fetcher)).toEqual({ v: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('isolates tenants: same key, different account, different entry', async () => {
    const cached = makeResource({ memoryTtlMs: 60000 })
    const fetcherA = jest.fn().mockResolvedValue('for-a')
    const fetcherB = jest.fn().mockResolvedValue('for-b')

    expect(await cached(makeCtx('account-a'), 'k', fetcherA)).toBe('for-a')
    expect(await cached(makeCtx('account-b'), 'k', fetcherB)).toBe('for-b')
    expect(fetcherA).toHaveBeenCalledTimes(1)
    expect(fetcherB).toHaveBeenCalledTimes(1)
  })

  it('bypasses caching entirely when the TTL is zero', async () => {
    const cached = makeResource({ memoryTtlMs: 0 })
    const ctx = makeCtx('acc2')
    const fetcher = jest.fn().mockResolvedValue('fresh')

    await cached(ctx, 'k', fetcher)
    await cached(ctx, 'k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('honours a per-call TTL override', async () => {
    const cached = makeResource({ memoryTtlMs: 60000 })
    const ctx = makeCtx('acc3')
    const fetcher = jest.fn().mockResolvedValue('x')

    await cached(ctx, 'k', fetcher, { memoryTtlMs: 0 })
    await cached(ctx, 'k', fetcher, { memoryTtlMs: 0 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('bounds by bytes: an oversized value is not retained', async () => {
    const cached = makeResource({ maxSizeBytes: 1024, memoryTtlMs: 60000 })
    const ctx = makeCtx('acc4')
    const big = { pad: 'x'.repeat(5000) }
    const fetcher = jest.fn().mockResolvedValue(big)

    expect(await cached(ctx, 'k', fetcher)).toEqual(big)
    // Larger than the whole budget, so it was refused rather than stored.
    await cached(ctx, 'k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('bounds by bytes: small values within the budget are retained', async () => {
    const cached = makeResource({ maxSizeBytes: 1024, memoryTtlMs: 60000 })
    const ctx = makeCtx('acc5')
    const fetcher = jest.fn().mockResolvedValue({ small: true })

    await cached(ctx, 'k', fetcher)
    await cached(ctx, 'k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reads through VBase when configured, without calling the origin', async () => {
    const cached = makeResource({ memoryTtlMs: 60000, vbaseTtlMinutes: 5 })
    const future = new Date(Date.now() + 60000)
    const ctx = makeCtx('acc6', { data: { from: 'vbase' }, ttl: future })
    const fetcher = jest.fn()

    expect(await cached(ctx, 'k', fetcher)).toEqual({ from: 'vbase' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(ctx.clients.vbase.getJSON).toHaveBeenCalledTimes(1)
  })

  it('populates VBase on a full miss', async () => {
    const cached = makeResource({ memoryTtlMs: 60000, vbaseTtlMinutes: 5 })
    const ctx = makeCtx('acc7', null)
    const fetcher = jest.fn().mockResolvedValue({ fresh: true })

    expect(await cached(ctx, 'k', fetcher)).toEqual({ fresh: true })
    expect(fetcher).toHaveBeenCalledTimes(1)

    await flush()
    expect(ctx.clients.vbase.saveJSON).toHaveBeenCalledTimes(1)
  })

  it('registers itself for stats collection', async () => {
    const cached = makeResource({ memoryTtlMs: 60000 })
    const ctx = makeCtx('acc8')

    await cached(ctx, 'k', jest.fn().mockResolvedValue(1))
    await cached(ctx, 'k', jest.fn().mockResolvedValue(1))

    const stats = collectCacheStats()
    const mine = stats.find((s: any) => s.name === `test-${uniq - 1}`)

    expect(mine).toBeDefined()
    expect((mine as any).itemCount).toBe(1)
  })
})
