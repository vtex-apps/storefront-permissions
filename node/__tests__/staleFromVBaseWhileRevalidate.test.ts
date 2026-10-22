import {
  deleteFromVBase,
  saveToVBase,
  staleFromVBaseWhileRevalidate,
} from '../utils/staleFromVBaseWhileRevalidate'

const flush = () => new Promise((resolve) => setImmediate(resolve))

const makeVBase = (stored: unknown) =>
  ({
    getJSON: jest.fn().mockResolvedValue(stored),
    saveJSON: jest.fn().mockResolvedValue(undefined),
  } as any)

describe('staleFromVBaseWhileRevalidate', () => {
  it('fetches, stores and returns when there is no cached entry', async () => {
    const vbase = makeVBase(null)
    const fetcher = jest.fn().mockResolvedValue({ some: 'data' })

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      fetcher
    )

    expect(result).toEqual({ some: 'data' })
    expect(fetcher).toHaveBeenCalledTimes(1)

    await flush()
    expect(vbase.saveJSON).toHaveBeenCalledTimes(1)

    const [[, , saved]] = vbase.saveJSON.mock.calls

    expect(saved.data).toEqual({ some: 'data' })
    expect(new Date(saved.ttl).getTime()).toBeGreaterThan(Date.now())
  })

  it('returns the cached value without fetching while fresh', async () => {
    const future = new Date(Date.now() + 60 * 1000)
    const vbase = makeVBase({ data: { cached: true }, ttl: future })
    const fetcher = jest.fn()

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      fetcher
    )

    expect(result).toEqual({ cached: true })
    expect(fetcher).not.toHaveBeenCalled()
    expect(vbase.saveJSON).not.toHaveBeenCalled()
  })

  it('serves stale immediately and revalidates in the background', async () => {
    const past = new Date(Date.now() - 60 * 1000)
    const vbase = makeVBase({ data: { cached: 'stale' }, ttl: past })
    const fetcher = jest.fn().mockResolvedValue({ cached: 'fresh' })

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      fetcher
    )

    // The caller gets the stale value with no waiting.
    expect(result).toEqual({ cached: 'stale' })

    await flush()

    // ...while the fresh value is fetched and stored for the next caller.
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(vbase.saveJSON).toHaveBeenCalledTimes(1)
    expect(vbase.saveJSON.mock.calls[0][2].data).toEqual({ cached: 'fresh' })
  })

  it('falls back to the fetcher when the VBase read fails', async () => {
    const vbase = {
      getJSON: jest.fn().mockRejectedValue(new Error('vbase down')),
      saveJSON: jest.fn().mockResolvedValue(undefined),
    } as any

    const fetcher = jest.fn().mockResolvedValue({ origin: true })

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      fetcher
    )

    expect(result).toEqual({ origin: true })
  })

  it('does not fail the caller when the background save fails, but logs it', async () => {
    const vbase = {
      getJSON: jest.fn().mockResolvedValue(null),
      saveJSON: jest.fn().mockRejectedValue(new Error('write denied')),
    } as any

    const logger = { error: jest.fn(), warn: jest.fn() } as any

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      jest.fn().mockResolvedValue('value'),
      undefined,
      { logger }
    )

    expect(result).toBe('value')
    await flush()
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error.mock.calls[0][0].message).toBe(
      'staleFromVBase.saveError'
    )
  })

  it('logs a failing background revalidation while still serving stale', async () => {
    const past = new Date(Date.now() - 60 * 1000)
    const vbase = makeVBase({ data: { cached: 'stale' }, ttl: past })
    const logger = { error: jest.fn(), warn: jest.fn() } as any
    const fetcher = jest.fn().mockRejectedValue(new Error('origin down'))

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'my-logical-key',
      fetcher,
      undefined,
      { logger }
    )

    // The caller is protected by the stale value, which is exactly why the
    // failure has to be logged: nothing else would ever surface it.
    expect(result).toEqual({ cached: 'stale' })

    await flush()
    expect(logger.error).toHaveBeenCalledTimes(1)

    const [[payload]] = logger.error.mock.calls

    expect(payload.message).toBe('staleFromVBase.revalidateError')

    // The log must reference the hashed storage name, never the logical key:
    // logical keys can carry identifiers (the active-user key contains the
    // shopper's email). The hash is deterministic, so a known key can still be
    // located by hashing it.
    expect(JSON.stringify(payload)).not.toContain('my-logical-key')
    expect(payload.key).toMatch(/^[0-9a-f]{32}\.json$/)
  })

  it('logs a warning when the VBase read fails and the origin is used', async () => {
    const vbase = {
      getJSON: jest.fn().mockRejectedValue(new Error('vbase down')),
      saveJSON: jest.fn().mockResolvedValue(undefined),
    } as any

    const logger = { error: jest.fn(), warn: jest.fn() } as any

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      jest.fn().mockResolvedValue({ origin: true }),
      undefined,
      { logger }
    )

    expect(result).toEqual({ origin: true })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0].message).toBe(
      'staleFromVBase.readError'
    )
  })
})

describe('saveToVBase', () => {
  it('stores the value under the hashed key with a future TTL', async () => {
    const vbase = makeVBase(null)

    saveToVBase(
      vbase,
      'bucket',
      'active-user-k',
      { v: 1 },
      {
        expirationInMinutes: 5,
      }
    )
    await flush()

    const [bucket, file, stored] = vbase.saveJSON.mock.calls[0]

    expect(bucket).toBe('bucket')
    expect(file).toMatch(/^[a-f0-9]{32}\.json$/)
    expect(file).not.toContain('active-user')
    expect(stored.data).toEqual({ v: 1 })
    expect(new Date(stored.ttl).getTime()).toBeGreaterThan(Date.now())
  })

  it('never rejects; a failed write is logged', async () => {
    const vbase = makeVBase(null)
    const logger = { error: jest.fn() } as any

    vbase.saveJSON.mockRejectedValue(new Error('vbase down'))

    expect(() => saveToVBase(vbase, 'bucket', 'k', 1, { logger })).not.toThrow()
    await flush()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'staleFromVBase.saveError' })
    )
  })
})

describe('staleFromVBaseWhileRevalidate with serveStale: false (INC-6700)', () => {
  it('treats an expired entry as a miss: fetches, blocks on it and stores it', async () => {
    const vbase = makeVBase({
      data: { v: 'stale' },
      ttl: new Date(Date.now() - 60 * 1000),
    })

    const fetcher = jest.fn().mockResolvedValue({ v: 'fresh' })

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      fetcher,
      undefined,
      { serveStale: false }
    )

    expect(result).toEqual({ v: 'fresh' })
    expect(fetcher).toHaveBeenCalledTimes(1)

    await flush()
    expect(vbase.saveJSON).toHaveBeenCalledTimes(1)
  })

  it('still serves a fresh entry without fetching', async () => {
    const vbase = makeVBase({
      data: { v: 'cached' },
      ttl: new Date(Date.now() + 60 * 1000),
    })

    const fetcher = jest.fn()

    const result = await staleFromVBaseWhileRevalidate(
      vbase,
      'bucket',
      'key',
      fetcher,
      undefined,
      { serveStale: false }
    )

    expect(result).toEqual({ v: 'cached' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('deleteFromVBase (INC-6700)', () => {
  it('deletes the normalized entry', async () => {
    const vbase = { deleteFile: jest.fn().mockResolvedValue(undefined) } as any

    await deleteFromVBase(vbase, 'bucket', 'some key')

    expect(vbase.deleteFile).toHaveBeenCalledTimes(1)
    expect(vbase.deleteFile.mock.calls[0][0]).toBe('bucket')
  })

  it('treats a missing entry as deleted and logs nothing', async () => {
    const logger = { warn: jest.fn() } as any
    const vbase = {
      deleteFile: jest.fn().mockRejectedValue({ response: { status: 404 } }),
    } as any

    await deleteFromVBase(vbase, 'bucket', 'key', logger)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('never rejects, and logs any other failure', async () => {
    const logger = { warn: jest.fn() } as any
    const vbase = {
      deleteFile: jest.fn().mockRejectedValue(new Error('down')),
    } as any

    await deleteFromVBase(vbase, 'bucket', 'key', logger)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'staleFromVBase.deleteError' })
    )
  })

  it('is a no-op without a VBase client', async () => {
    expect(await deleteFromVBase(undefined, 'bucket', 'key')).toBeUndefined()
  })
})
