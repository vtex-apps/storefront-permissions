import { createHash } from 'crypto'

import { describeClientError } from '../utils/clientError'
import { VBASE_CACHE_BUCKET } from '../utils/constants'

/**
 * INC-6700: the last organization switch made through this app, per shopper,
 * in VBase so every pod sees it.
 *
 * The active-user cache is keyed by `email + b2bCurrentCostCenter + pin`. A
 * session that switched carries the new cost center and misses, but a NEW
 * session (new login, another device, expired session) carries none and reads
 * the `email|default|none` entry - which a switch could only drop from the
 * memory of the pod that ran it. Other pods kept serving the organization the
 * shopper left for the whole TTL.
 *
 * The marker fixes both ends: a cached entry older than it is refused, and the
 * miss that follows reads the record it names by id - no search index - so the
 * first read after a switch already lands on the new organization, even when
 * the transform input carries no `storeUserId` (1.x declaration) and the
 * selection cannot be read.
 *
 * Keyed by a hash of the email: no shopper identifier in the file name.
 * Advisory only - `b2b_users.active` stays the truth, and the record it names
 * is used only when a read by id says it is still active.
 */
export interface ActiveSwitchMarker {
  b2bUserId: string
  orgId: string
  costId: string
  /** Epoch ms of the switch. */
  at: number
}

const markerFile = (email: string) =>
  `active-switch-${createHash('sha256')
    .update(String(email).trim().toLowerCase())
    .digest('hex')}.json`

const isMarker = (value: unknown): value is ActiveSwitchMarker => {
  const candidate = value as Partial<ActiveSwitchMarker> | null

  return (
    !!candidate?.b2bUserId &&
    !!candidate?.orgId &&
    !!candidate?.costId &&
    typeof candidate?.at === 'number'
  )
}

/** Never rejects: a missing or unreadable marker reads as null. */
export const readActiveSwitchMarker = async (
  ctx: Context,
  email: string
): Promise<ActiveSwitchMarker | null> => {
  const vbase = ctx.clients?.vbase

  if (!vbase || !email) {
    return null
  }

  try {
    const marker = await vbase.getJSON<ActiveSwitchMarker>(
      VBASE_CACHE_BUCKET,
      markerFile(email),
      true
    )

    return isMarker(marker) ? marker : null
  } catch (error) {
    ctx.vtex.logger.warn({
      error: describeClientError(error),
      message: 'activeSwitchMarker.readError',
    })

    return null
  }
}

/** Never rejects; returns whether the marker was written. */
export const writeActiveSwitchMarker = async (
  ctx: Context,
  email: string,
  record: Omit<ActiveSwitchMarker, 'at'>,
  at: number = Date.now()
): Promise<boolean> => {
  const vbase = ctx.clients?.vbase

  if (!vbase || !email) {
    return false
  }

  try {
    await vbase.saveJSON(VBASE_CACHE_BUCKET, markerFile(email), {
      at,
      b2bUserId: String(record.b2bUserId),
      costId: String(record.costId),
      orgId: String(record.orgId),
    })

    return true
  } catch (error) {
    ctx.vtex.logger.warn({
      error: describeClientError(error),
      message: 'activeSwitchMarker.writeError',
    })

    return false
  }
}
