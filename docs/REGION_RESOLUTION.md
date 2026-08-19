# Region resolution: who sets the region, from which address

Three mechanisms can influence the session's region. They answer **different questions** and are designed to compose — removing one of them is not a simplification, it changes behavior. This doc is the map.

| Mechanism | Question it answers | Locality used | Scope |
|---|---|---|---|
| Default (no flags) | — | Cost center address | This app calls the checkout regions API and writes `public.regionId` |
| `deferRegionToCheckoutSession` (app setting) | **Who resolves** the region | Cost center address (same as default) | Account-wide |
| `enableRegionOverwrite` + `public.allowRegionOverwrite` (setting + per-request input) | **Which location** the region is for | Whatever the shopper entered | Per request, shopper-initiated |

## Default behavior

`setProfile` resolves the region from the **selected cost center address** (see [Cost center address and region](COST_CENTER_ADDRESS_AND_REGION.md) for how the address is selected) by calling `checkout.getRegionId(country, postalCode, sc)`, and writes the result to `public.regionId`. The lookup is cached (30min, both layers) keyed by the full input tuple, since the result is a pure function of it.

## `deferRegionToCheckoutSession` — the server-side handoff

When enabled, this app stops calling the regions API. Instead it publishes the cost center locality as **`public.postalCode` + `public.country`** and leaves `public.regionId` untouched (the key is *deleted* from the response, never written empty, so a region another app resolved is never cleared). Downstream:

- **`vtex.checkout-session`** reads `public.regionId` first ("direct insert"); when absent it resolves `checkout.regionId` itself from `public.country` + `public.postalCode`/`geoCoordinates` + sales channel — the *same* lookup this app used to make, cached on their side (60min expiry / 10min revalidate). `checkout.regionId` is the canonical field the platform and `vtex_segment` consume.
- **`vtex.search-session`** reads `public.postalCode`/`country` (never the `checkout` namespace) to regionalize Intelligent Search. This fixes a long-standing inconsistency: previously the cart was regionalized by the cost center address while search saw no locality at all.
- Sales channel: checkout-session uses `public.sc`, falling back to `store.channel` — so this composes correctly with `deferSalesChannelToBinding` (see [Sales channel and binding coexistence](SALES_CHANNEL_BINDING_COEXISTENCE.md)).

Safety valves: the handoff requires the cost center address to have a country **and** postal code (checkout-session's input contract); otherwise this app falls back to resolving the region itself. And it stands down entirely when region overwrite is active for the request.

> Rollout note: because search starts seeing the cost center locality, QA product availability and delivery promises for a B2B user before enabling this on an account.

## `allowRegionOverwrite` — the shopper's "check delivery to another location"

This is a **product feature**, not an implementation detail, and it must not be removed in favor of the handoff: the two are not equivalent. With only the server-side flag, this app writes the cost center locality on every transform — a shopper-entered postal code would be overwritten right back. `allowRegionOverwrite` is the signal that tells both resolution modes to stand down for the request so the shopper's location wins: `public.regionId` is set explicitly empty, the cart shipping address is not stamped, and checkout-session resolves from the shopper's values.

Contract for frontends (unchanged): send `allowRegionOverwrite` **together with** the shopper's `public.postalCode` and `public.country`. This matters more with the handoff enabled, because postal-code *presence* in the session no longer implies the shopper typed it — this app may have written the cost center's.

## Session contract

`vtex.session/configuration.json`: `postalCode` and `country` are both **inputs** (read by the overwrite detection — removing them silently kills that feature, since the session runtime would stop copying them into the transform body) and **outputs** (written by the handoff). The same dual input/output pattern the app already uses for `hash`.

## Known consumers of `public.regionId`

Only two apps declare it in a session contract: `vtex.checkout-session` (optional short-circuit; resolves itself when absent) and `vtex.price-table-selector` (rule variable `public.regionId.value`, **no fallback** — an account using price-table rules keyed on region should not enable the handoff without reviewing those rules).

## History

The address-selection and region-overwrite features shipped together (Feb 2026) for a headless B2B storefront whose frontend writes the cost center locality to `public.postalCode`/`country` client-side on cost-center change — effectively the same pattern `deferRegionToCheckoutSession` now implements server-side. The two write the same values from the same source and are compatible.
