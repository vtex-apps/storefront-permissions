# Testing cost center address selection and region overwrite

Quick steps to test the new session behavior (cost center address selection and region overwrite) in a development workspace.

## Prerequisites

- VTEX CLI installed and logged in (`vtex login`)
- A development workspace with B2B (e.g. `vtex use dev; vtex install vtex.b2b-suite` or use an existing B2B account)
- At least one organization with a cost center that has **multiple addresses** (for address selection) or one address (for region overwrite only)

## 1. Link the app

From the app root:

```bash
vtex link
```

Use the workspace you want to test in (e.g. `yourname-dev`).

## 2. Enable app settings

1. In VTEX Admin, go to **Apps** → **Storefront Permissions** (or **My account** → **Account settings** → **Apps**).
2. Enable:
   - **Enable cost center address selection** (to use `costCenterAddressId` and selected address for region/shipping/document type).
   - **Enable region overwrite** (to allow “check another location” with `allowRegionOverwrite` + `postalCode` + `country`).

Save. Changes can take up to the app settings cache TTL (see `COST_CENTER_ADDRESS_AND_REGION.md`) to apply.

## 3. How to test

### Option A: Storefront (session)

1. Log in to the storefront as a B2B user (organization + cost center with addresses).
2. **Address selection:** If the storefront sends `public.costCenterAddressId` (e.g. from a dropdown), change the selected address and confirm region/shipping/document type follow the selected address. Check session or network for `storefront-permissions.costCenterAddressId` in the response.
3. **Region overwrite:** In “check delivery to another location” (or equivalent), set postal code and country. Confirm `public.regionId` is empty in the session and that checkout uses the entered postal code/country for region (delivery options, etc.).

### Option B: Session transform endpoint (Postman / curl)

The session transform is called by the session backend. You can also call it directly for debugging (same body shape the session sends):

- **URL:** `POST https://{workspace}--{account}.myvtex.com/_v/storefront-permissions/session/transform`
- **Headers:** Same as a normal storefront request (cookies/session as needed; the route is public but the handler uses the request body).
- **Body (JSON):** Session-like payload, e.g.:

```json
{
  "public": {
    "costCenterAddressId": { "value": "<addressId-from-cost-center>" },
    "allowRegionOverwrite": { "value": true },
    "postalCode": { "value": "01310100" },
    "country": { "value": "BRA" }
  },
  "checkout": { "orderFormId": "<orderFormId>" },
  "storefront-permissions": { "hash": "<current-hash>" }
}
```

- With **address selection on:** Vary `costCenterAddressId.value` (valid id, empty, or invalid) and check `response.public.regionId` and `response['storefront-permissions'].costCenterAddressId`.
- With **region overwrite on** and `allowRegionOverwrite` + `postalCode` + `country` set: Check that `response.public.regionId.value` is `""` and that the cart is not updated with a cost center address.

## 4. What to check

| Scenario | Check |
|----------|--------|
| Address selection off | First cost center address is used; `costCenterAddressId` in request ignored. |
| Address selection on, valid id | `storefront-permissions.costCenterAddressId` = that id; region/shipping from that address. |
| Address selection on, empty id | `storefront-permissions.costCenterAddressId` = `""`; internal logic still uses first address. |
| Region overwrite on + postalCode & country | `public.regionId.value` = `""`; no cart shipping update; checkout-session sets region from postalCode/country. |

For full behavior, see [Cost center address and region](COST_CENTER_ADDRESS_AND_REGION.md).
