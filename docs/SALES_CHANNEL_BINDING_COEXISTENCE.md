# Sales channel coexistence with binding selection

This document describes how **Storefront Permissions** decides the sales channel (`sc`) it writes to the session and cart in the `setProfile` session transform, and the opt-in setting that lets it coexist with apps that also set the sales channel from the shopper's chosen binding (e.g. `vtex.binding-selector`). It is intended for developers integrating with the session or debugging sales channel behavior in multi-binding B2B stores.

## Overview

`setProfile` resolves a sales channel from the organization's `salesChannel` field and, whenever it resolves one, unconditionally writes it to `public.sc` in the session and re-stamps the checkout order form with it. When the organization has **no** `salesChannel` configured, the app used to always fall back to the account's first active sales channel.

In stores that also use bindings to serve multiple locales/sales channels (`vtex.binding-selector`), that app sets the sales channel from the binding the shopper picked, restamping the cart the same way. Both apps write to the same shared `public.sc` session field from independent triggers, with no defined precedence — whichever one runs last wins. In practice, this means a shopper can switch bindings, see the storefront reflect the new locale, and still have checkout/cart retain the wrong sales channel context.

## 1. Session contract (output)

| Field | Description |
|-------|-------------|
| `public.sc` | The resolved sales channel. Omitted from the `setProfile` response entirely (not sent even as an empty value) when the organization has no `salesChannel` and `deferSalesChannelToBinding` is on, so the session merge leaves it as whatever already set it — see below. |
| `public.regionId` | Unaffected by this setting: region lookup uses its own independent sales-channel fallback so it always has a value to query with, even when the session's `sc` write is deferred. |

This is part of the same `setProfile` output already declared in `vtex.session/configuration.json` (`public.sc`); no new session input/output field was added.

## 2. App setting (feature flag)

| Setting | Default | Effect when **off** | Effect when **on** |
|--------|--------|---------------------|--------------------|
| **Defer sales channel to binding** (`deferSalesChannelToBinding`) | `false` | An organization with no `salesChannel` configured falls back to the account's first active sales channel, and the app writes it to `public.sc` and re-stamps the cart with it (backward compatible). | An organization with no `salesChannel` configured is **not** defaulted: the app skips the `public.sc` write and the cart re-stamp entirely, leaving the sales channel to whatever already set it (e.g. the binding). |

Only the merchant can turn this on in the VTEX Admin (App settings). It has no effect for organizations that **do** have a `salesChannel` configured — those keep being written as before, on or off.

## 3. Logic flow (what the code does)

- `setProfile` loads the organization, cost center, sales channels, marketing tags, B2B settings, and **app settings** in parallel (app settings are cached in memory, see [Cost center address and region § 6](COST_CENTER_ADDRESS_AND_REGION.md#6-caching-app-settings) for the caching pattern).
- `hasOrgSalesChannel` = the organization has a non-empty `salesChannel`.
- `deferSalesChannelToBinding` = `!hasOrgSalesChannel && appSettings.deferSalesChannelToBinding`.
- If `deferSalesChannelToBinding` is **false**: unchanged behavior — when the organization's `salesChannel` is empty or not an active sales channel, it falls back to the account's first active sales channel.
- If `deferSalesChannelToBinding` is **true**: the fallback is skipped, so `salesChannel` stays empty; the app does **not** call `checkout.updateSalesChannel`, and it **deletes** `public.sc` from the response instead of sending `{ value: '' }` — an explicit empty value is treated as a real write during session merge elsewhere in this app (e.g. the `regionId` case), so leaving the key in would have cleared whatever already set the sales channel.
- **Region lookup is independent:** a separate `regionLookupSalesChannel` (the resolved `salesChannel`, or the first active sales channel if none) is used only for the `checkout.getRegionId` call, so deferring the session/cart write never leaves the region lookup without a sales channel.

## 4. Summary table

| Scenario | `public.sc` | Cart re-stamp | Region lookup |
|----------|-------------|----------------|----------------|
| Org has a valid `salesChannel` | Written | Yes | Uses the org's sales channel |
| Org has no `salesChannel`, flag **off** | Written (first active sales channel) | Yes | Uses the first active sales channel |
| Org has no `salesChannel`, flag **on** | **Not written** (deferred) | **No** | Uses the first active sales channel (independent fallback) |

## 5. Related configuration

- **Session:** `vtex.session/configuration.json` declares `public.sc` as an output of the `storefront-permissions` transform — the same shared field `vtex.binding-selector` writes to when restamping the cart for a binding change.
- **App settings:** `manifest.json` `settingsSchema` defines **Defer sales channel to binding** (boolean, default `false`).
- **Binding selector:** [`vtex.binding-selector`](https://github.com/vtex-apps/binding-selector) restamps the checkout order form's sales channel (`updateSalesChannel` → `POST /orderForm/{id}/items?sc={salesChannel}`) when the shopper changes binding. Enable `deferSalesChannelToBinding` when this app is installed and organizations are intentionally left without a `salesChannel` so the binding stays the source of truth.
