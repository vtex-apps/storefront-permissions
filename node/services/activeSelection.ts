import {
  ACTIVE_SELECTION_DATA_ENTITY,
  ACTIVE_SELECTION_FIELDS,
} from '../utils/constants'
import { describeClientError } from '../utils/clientError'

export interface ActiveSelection {
  /** The `b2b_users` document the shopper switched to. */
  b2bUserId: string
  orgId: string
  costId: string
}

/**
 * Which shopper a selection belongs to.
 *
 * Not the `b2b_users` document id: that one is per (person x organization x
 * cost center), so a shopper holding three organizations has three of them and
 * none identifies the person. Not the email either - it is the shopper's own
 * stable id we key on, so the record survives an email change and never puts a
 * shopper identifier in a document id.
 *
 * The precedence mirrors exactly how `setProfile` resolves the acting email,
 * because the selection has to follow the same person the rest of the
 * transform is resolving. Under either impersonation
 * `authentication.storeUserId` is the *operator*, so keying on it would file
 * the shopper's selection under whoever is impersonating them.
 *
 * There are two distinct impersonations and they arrive differently: the
 * platform's own (`impersonate.storeUserId`, owned by
 * `vtex.impersonate-session`) and this app's (`public.impersonate`, written by
 * the `impersonateUser` mutation). Only the first has been checked against a
 * live session; the second is read from the code.
 */
export const resolveSelectionKey = ({
  b2bImpersonatedProfileUserId,
  sessionStoreUserId,
  platformImpersonatedStoreUserId,
}: {
  /**
   * The *profile* user id of a B2B-impersonated shopper - `user.userId`, after
   * resolving the record.
   *
   * Not `public.impersonate` itself. That value is a `b2b_users` document id,
   * which is per (person x organization x cost center); passing it here would
   * key the selection by the record it is supposed to point at, so a shopper
   * would get a different key in every organization and the lookup would never
   * hit. `setProfile` already resolves it through `getUser` to reach the email,
   * and `user.userId` is what falls out of that.
   */
  b2bImpersonatedProfileUserId?: string | null
  /**
   * `impersonate.storeUserId` - the platform's own impersonation, owned by
   * `vtex.impersonate-session`. Already a profile user id, so no resolution is
   * needed. (`setProfile` calls this branch `telemarketingImpersonate`, which
   * predates the feature being general.)
   *
   * Confirmed against a live session: it holds the impersonated shopper while
   * `authentication.storeUserId` holds the operator.
   */
  platformImpersonatedStoreUserId?: string | null
  /** `authentication.storeUserId` - the signed-in shopper, when nobody is impersonating. */
  sessionStoreUserId?: string | null
}): string | null =>
  b2bImpersonatedProfileUserId ||
  platformImpersonatedStoreUserId ||
  sessionStoreUserId ||
  null

const isCompleteSelection = (value: unknown): value is ActiveSelection => {
  const candidate = value as Partial<ActiveSelection> | null

  return !!candidate?.b2bUserId && !!candidate?.orgId && !!candidate?.costId
}

/**
 * Reads the shopper's last switch straight from storage, bypassing the search
 * index.
 *
 * Every "not there" case answers the same way: Master Data returns HTTP 200
 * with an empty body whether the document is missing, the entity has never
 * been created, or the account has simply never had a switch. Verified against
 * all three - byte-identical responses - so one branch covers them and there is
 * no 404 to catch.
 *
 * That empty body arrives as an empty string, which is falsy but is not
 * nullish. `??` would therefore keep it and hand `''` to the caller, so the
 * checks here are truthiness-based on purpose.
 *
 * Returns null on anything unexpected. This is an optimisation over a lookup
 * that still exists: the caller falls back to the search path, so a failure
 * here must degrade to the old behaviour rather than fail the transform.
 */
export const readActiveSelection = async (
  ctx: Context,
  selectionKey: string
): Promise<ActiveSelection | null> => {
  const {
    clients: { masterDataExtended },
    vtex: { logger },
  } = ctx

  try {
    const document = await masterDataExtended.getDocumentById(
      ACTIVE_SELECTION_DATA_ENTITY,
      selectionKey,
      ACTIVE_SELECTION_FIELDS
    )

    if (!document) {
      return null
    }

    return isCompleteSelection(document) ? document : null
  } catch (error) {
    logger.warn({
      error: describeClientError(error),
      message: 'readActiveSelection.error',
    })

    return null
  }
}

/**
 * Records the switch under the shopper's key.
 *
 * Awaited rather than fire-and-forget: the storefront queries the new
 * organization immediately after the mutation returns, so a selection written
 * after the response would lose the race this exists to win. It costs one
 * document write (~150-300ms measured), against the 0.8s to 35s the index lag
 * costs when it is missing.
 *
 * Never throws. `b2b_users.active` remains the durable truth - this only
 * records which document to read - so a failed write degrades to the search
 * path instead of failing a switch that otherwise succeeded.
 */
export const writeActiveSelection = async (
  ctx: Context,
  selectionKey: string,
  selection: ActiveSelection
): Promise<boolean> => {
  const {
    clients: { masterDataExtended },
    vtex: { logger },
  } = ctx

  try {
    await masterDataExtended.putDocumentById(
      ACTIVE_SELECTION_DATA_ENTITY,
      selectionKey,
      { ...selection, updatedAt: new Date().toISOString() }
    )

    return true
  } catch (error) {
    logger.warn({
      error: describeClientError(error),
      message: 'writeActiveSelection.error',
    })

    return false
  }
}
