# Cost center address selection and region overwrite

This document describes how **Storefront Permissions** handles multiple cost center addresses and optional region overwrite in the `setProfile` session transform. It is intended for developers integrating with the session or debugging region/address behavior.

## Overview

When a B2B user has a cost center with **multiple addresses**, the storefront may let them choose which address to use for shipping, region (e.g. delivery options, pricing), and document type (e.g. Brazil CPF). In addition, the user may temporarily **override** the region (e.g. "check delivery to another location") by entering a postal code and country, without changing the cost center's selected address. This app supports both behaviors in an **opt-in** way via app settings.

---

## 1. Session contract (input / output)

### Input (public namespace)

The session backend sends the current session to `setProfile`. The transform reads the following from the **public** namespace when the corresponding app settings are enabled:

| Field | Used when | Description |
|-------|-----------|-------------|
| `costCenterAddressId` | `enableCostCenterAddressSelection` is on | The address id the user selected for this cost center. If sent as **empty or null**, the selection is treated as "cleared". |
| `allowRegionOverwrite` | `enableRegionOverwrite` is on | If present/truthy, the app may leave region and cart address to checkout-session (see below). |
| `postalCode` | `enableRegionOverwrite` + overwrite requested | Required together with `country` for region overwrite to take effect. |
| `country` | `enableRegionOverwrite` + overwrite requested | Required together with `postalCode` for region overwrite to take effect. |

These are declared in `vtex.session/configuration.json` under `input.public`.

### Output (storefront-permissions namespace)

| Field | Description |
|-------|-------------|
| `costCenterAddressId` | The address id currently used for region, shipping, and document type. Empty if the user cleared the selection (sent empty/null) or if there are no addresses. |
| (other existing fields) | `costcenter`, `organization`, `priceTables`, `userId`, `hash`, etc. |

### Output (public namespace)

| Field | Description |
|-------|-------------|
| `regionId` | Either the region id derived from the **selected** cost center address, or **explicitly empty** when region overwrite is active (so checkout-session can derive region from `public.postalCode` and `public.country`). |

---

## 2. App settings (feature flags)

All new behavior is **off by default** (backward compatible).

| Setting | Default | Effect when **off** | Effect when **on** |
|--------|--------|---------------------|--------------------|
| **Enable cost center address selection** | `false` | `costCenterAddressId` in the request is ignored. The **first** cost center address is always used. | The app reads `costCenterAddressId` from public, validates it against the current cost center, and uses that address (or first if invalid/missing). Outputs the selected id or empty if the user cleared it. |
| **Enable region overwrite** | `false` | Region and cart address always come from the cost center address. | If the client sends `allowRegionOverwrite` **and** both `public.postalCode` and `public.country` are set, the app sets `public.regionId` to **empty** and does **not** update the cart shipping address; checkout-session is responsible for setting `checkout.regionId` from postalCode/country. |

Only the merchant can turn these on in the VTEX Admin (App settings). The frontend cannot use the behavior unless the corresponding setting is enabled.

---

## 3. Logic flow (what the code does)

### 3.1 Load data and flags

- The app loads organization, cost center, sales channels, marketing tags, B2B settings, and **app settings** (from manifest) in parallel. App settings are cached in memory (LRU, 5 minutes) to avoid calling the Apps API on every request.
- From app settings it reads:
  - `enableCostCenterAddressSelection`
  - `enableRegionOverwrite`
- From the request body (session):
  - `public.costCenterAddressId.value` → `requestedAddressId` (only if the feature is on)
  - `public.allowRegionOverwrite.value` → combined with the app setting → `allowRegionOverwrite`
  - `public.postalCode.value` → `hasPublicPostalCode`
  - `public.country.value` → `hasPublicCountry`
- **Region overwrite is applied only when all of these are true:**  
  `usePublicPostalCodeForRegion = allowRegionOverwrite && hasPublicPostalCode && hasPublicCountry`

### 3.2 Selected address

- **Cost center addresses** come from the cost center GraphQL response (`addresses` array, each with `addressId`).
- If the user **explicitly cleared** the selection (feature on and `costCenterAddressId` sent as empty or null):
  - The app still picks the **first** address for internal use (region, shipping, document type) for that request.
  - The **output** `costCenterAddressId` is set to **empty** so the session stores "no selection".
- Otherwise:
  - If a valid `requestedAddressId` is sent and exists in the cost center → that address is **selected**.
  - If the id is invalid or not sent → the **first** address is used.
- The output `storefront-permissions.costCenterAddressId` is:
  - **Empty** when the user explicitly cleared the selection.
  - Otherwise the **selected** address's `addressId` (or empty if there are no addresses).

### 3.3 Document type (e.g. Brazil CPF)

- If there is a **selected address**, Brazil is determined from that address's country.
- Otherwise, the app uses the previous rule: any cost center address in Brazil.

### 3.4 Region and cart (when there is a selected address and order form id)

- **Marketing data** (e.g. UTM, marketing tags) is **always** updated from the cost center/org when applicable.
- **Region (`public.regionId`):**
  - If **not** `usePublicPostalCodeForRegion`: the app calls the checkout API to get `regionId` from the **selected** address and sets `response.public.regionId` to that value.
  - If **`usePublicPostalCodeForRegion`**: the app **does not** call the region API and sets **`response.public.regionId = { value: '' }`** so the session has an explicit empty; **checkout-session** is responsible for setting `checkout.regionId` from `public.postalCode` and `public.country`.
- **Cart shipping address:**
  - If **not** `usePublicPostalCodeForRegion`: the app calls **updateOrderFormShipping** with the **selected** address.
  - If **`usePublicPostalCodeForRegion`**: the app **does not** update the cart with an address (the user is in "check another location" mode; only postalCode/country are available, not a full address).

---

## 4. Summary table

| Scenario | `costCenterAddressId` output | `public.regionId` | Cart shipping |
|----------|------------------------------|--------------------|---------------|
| Feature off / no selection | First address id or empty | From selected (first) address | Updated with selected (first) address |
| User selected an address | That address id | From that address | Updated with that address |
| User cleared selection (empty/null) | **Empty** | From first address (internal) | Updated with first address |
| Region overwrite on + postalCode & country set | Unchanged by overwrite | **Set to empty** | **Not** updated |

---

## 5. Related configuration

- **Session:** `vtex.session/configuration.json` declares the input (e.g. `costCenterAddressId`, `allowRegionOverwrite`, `postalCode`, `country`) and output (`costCenterAddressId`, `regionId`) used above.
- **App settings:** `manifest.json` `settingsSchema` defines **Enable cost center address selection** and **Enable region overwrite** (both boolean, default `false`).
- **Checkout-session:** When region overwrite is active, this app only clears `public.regionId`; the app that sets `checkout.regionId` from `public.postalCode` and `public.country` is the **checkout-session** backend.

---

## 6. Caching (app settings)

To avoid calling the Apps API on every `setProfile` request, the app uses an in-memory **LRU cache** for manifest app settings (the same pattern as [salesforce-oauth-middleware](https://github.com/vtex-apps/salesforce-oauth-middleware/blob/master/node/services/appSettingsService.ts)):

- **Cache key:** `{account}-{workspace}-{appId}`
- **TTL:** 5 minute
- **Effect:** Changes to app settings in the Admin can take up to 5 minutes to apply to `setProfile` behavior.
