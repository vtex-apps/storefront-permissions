import {
  readActiveSwitchMarker,
  writeActiveSwitchMarker,
} from '../services/activeSwitchMarker'

const makeCtx = (vbase: any): any => ({
  clients: { vbase },
  vtex: { logger: { warn: jest.fn() } },
})

describe('active switch marker (INC-6700)', () => {
  it('round-trips through VBase under a file name that carries no email', async () => {
    const store = new Map<string, any>()
    const vbase = {
      getJSON: jest.fn(
        async (_: string, file: string) => store.get(file) ?? null
      ),
      saveJSON: jest.fn(async (_: string, file: string, data: any) => {
        store.set(file, data)
      }),
    }

    const ctx = makeCtx(vbase)

    expect(
      await writeActiveSwitchMarker(
        ctx,
        'Buyer@Test.com',
        { b2bUserId: 'u2', costId: 'cost2', orgId: 'org2' },
        1234
      )
    ).toBe(true)

    const [[bucket, file]] = vbase.saveJSON.mock.calls

    expect(bucket).toBe('sfp-cache')
    expect(file).not.toContain('buyer')
    expect(file).toMatch(/^active-switch-[0-9a-f]{64}\.json$/)

    // Same shopper regardless of case.
    expect(await readActiveSwitchMarker(ctx, 'buyer@test.com')).toEqual({
      at: 1234,
      b2bUserId: 'u2',
      costId: 'cost2',
      orgId: 'org2',
    })
  })

  it('reads an incomplete or missing marker as null', async () => {
    const ctx = makeCtx({
      getJSON: jest.fn().mockResolvedValue({ b2bUserId: 'u2' }),
    })

    expect(await readActiveSwitchMarker(ctx, 'buyer@test.com')).toBeNull()
  })

  it('never rejects: a read failure is logged and reads as null', async () => {
    const ctx = makeCtx({
      getJSON: jest.fn().mockRejectedValue(new Error('down')),
    })

    expect(await readActiveSwitchMarker(ctx, 'buyer@test.com')).toBeNull()
    expect(ctx.vtex.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'activeSwitchMarker.readError' })
    )
  })

  it('never rejects: a write failure is logged and reported as not written', async () => {
    const ctx = makeCtx({
      saveJSON: jest.fn().mockRejectedValue(new Error('down')),
    })

    expect(
      await writeActiveSwitchMarker(ctx, 'buyer@test.com', {
        b2bUserId: 'u2',
        costId: 'cost2',
        orgId: 'org2',
      })
    ).toBe(false)
    expect(ctx.vtex.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'activeSwitchMarker.writeError' })
    )
  })

  it('does nothing without a VBase client', async () => {
    const ctx = makeCtx(undefined)

    expect(await readActiveSwitchMarker(ctx, 'buyer@test.com')).toBeNull()
    expect(
      await writeActiveSwitchMarker(ctx, 'buyer@test.com', {
        b2bUserId: 'u2',
        costId: 'cost2',
        orgId: 'org2',
      })
    ).toBe(false)
  })
})
