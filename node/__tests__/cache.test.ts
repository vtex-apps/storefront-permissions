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

  describe('bypassRead (INC-6700)', () => {
    it('skips the memory read, refetches and refreshes the memory entry', async () => {
      const cached = makeResource({ memoryTtlMs: 60000 })
      const ctx = makeCtx('acc-bypass-1')
      const stale = jest.fn().mockResolvedValue({ v: 'old' })
      const fresh = jest.fn().mockResolvedValue({ v: 'new' })

      expect(await cached(ctx, 'k', stale)).toEqual({ v: 'old' })
      expect(await cached(ctx, 'k', fresh, { bypassRead: true })).toEqual({
        v: 'new',
      })
      expect(fresh).toHaveBeenCalledTimes(1)

      // The fresh value was written: a normal read now serves it from memory.
      const never = jest.fn()

      expect(await cached(ctx, 'k', never)).toEqual({ v: 'new' })
      expect(never).not.toHaveBeenCalled()
    })

    it('never reads VBase (not even a stale entry) but writes the fresh value to it', async () => {
      const cached = makeResource({ memoryTtlMs: 60000, vbaseTtlMinutes: 5 })
      const ctx = makeCtx('acc-bypass-2', {
        data: { v: 'stale' },
        ttl: new Date(Date.now() - 60000),
      })

      const fetcher = jest.fn().mockResolvedValue({ v: 'fresh' })

      expect(await cached(ctx, 'k', fetcher, { bypassRead: true })).toEqual({
        v: 'fresh',
      })
      expect(ctx.clients.vbase.getJSON).not.toHaveBeenCalled()

      await flush()
      expect(ctx.clients.vbase.saveJSON).toHaveBeenCalledTimes(1)

      const [bucket, , stored] = ctx.clients.vbase.saveJSON.mock.calls[0]

      expect(bucket).toBe('sfp-cache')
      expect(stored.data).toEqual({ v: 'fresh' })
      expect(new Date(stored.ttl).getTime()).toBeGreaterThan(Date.now())
    })

    it('writes nothing when the fetcher rejects', async () => {
      const cached = makeResource({ memoryTtlMs: 60000, vbaseTtlMinutes: 5 })
      const ctx = makeCtx('acc-bypass-3', null)
      const failing = jest.fn().mockRejectedValue(new Error('boom'))

      await expect(
        cached(ctx, 'k', failing, { bypassRead: true })
      ).rejects.toThrow('boom')

      await flush()
      expect(ctx.clients.vbase.saveJSON).not.toHaveBeenCalled()

      const fetcher = jest.fn().mockResolvedValue('ok')

      expect(await cached(ctx, 'k', fetcher)).toBe('ok')
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('leaves the normal read path unchanged when false', async () => {
      const cached = makeResource({ memoryTtlMs: 60000 })
      const ctx = makeCtx('acc-bypass-4')
      const fetcher = jest.fn().mockResolvedValue(1)

      await cached(ctx, 'k', fetcher, { bypassRead: false })
      await cached(ctx, 'k', fetcher, { bypassRead: false })
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('still honours a zero TTL (no caching at all)', async () => {
      const cached = makeResource({ memoryTtlMs: 0, vbaseTtlMinutes: 5 })
      const ctx = makeCtx('acc-bypass-5', null)
      const fetcher = jest.fn().mockResolvedValue(1)

      await cached(ctx, 'k', fetcher, { bypassRead: true })
      await flush()
      expect(ctx.clients.vbase.saveJSON).not.toHaveBeenCalled()
    })
  })

  describe('invalidate (INC-6700)', () => {
    it('drops the memory entry so the next read refetches', async () => {
      const cached = makeResource({ memoryTtlMs: 60000 })
      const ctx = makeCtx('acc-inv-1')
      const fetcher = jest
        .fn()
        .mockResolvedValueOnce('before')
        .mockResolvedValueOnce('after')

      expect(await cached(ctx, 'k', fetcher)).toBe('before')
      await cached.invalidate(ctx, 'k')
      expect(await cached(ctx, 'k', fetcher)).toBe('after')
      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('leaves other keys and other tenants alone', async () => {
      const cached = makeResource({ memoryTtlMs: 60000 })
      const ctxA = makeCtx('acc-inv-a')
      const ctxB = makeCtx('acc-inv-b')
      const fetcher = jest.fn().mockResolvedValue('v')

      await cached(ctxA, 'k', fetcher)
      await cached(ctxA, 'other', fetcher)
      await cached(ctxB, 'k', fetcher)
      await cached.invalidate(ctxA, 'k')

      await cached(ctxA, 'other', fetcher)
      await cached(ctxB, 'k', fetcher)
      expect(fetcher).toHaveBeenCalledTimes(3)
    })

    it('deletes the VBase entry too when the resource uses VBase', async () => {
      const cached = makeResource({ memoryTtlMs: 60000, vbaseTtlMinutes: 5 })
      const ctx = makeCtx('acc-inv-2')

      // A real VBase client has deleteFile; the shared mock does not, so it
      // is added here (spyOn needs an existing function to wrap).
      ctx.clients.vbase.deleteFile = () => Promise.resolve()
      jest.spyOn(ctx.clients.vbase, 'deleteFile')

      await cached.invalidate(ctx, 'k')

      expect(ctx.clients.vbase.deleteFile).toHaveBeenCalledTimes(1)
      expect(ctx.clients.vbase.deleteFile.mock.calls[0][0]).toBe('sfp-cache')
    })

    it('does not serve a stale VBase entry when vbaseServeStale is false', async () => {
      const cached = makeResource({
        memoryTtlMs: 60000,
        vbaseServeStale: false,
        vbaseTtlMinutes: 5,
      })

      const ctx = makeCtx('acc-inv-3', {
        data: 'stale',
        ttl: new Date(Date.now() - 60000),
      })

      const fetcher = jest.fn().mockResolvedValue('fresh')

      expect(await cached(ctx, 'k', fetcher)).toBe('fresh')
    })
  })
})
