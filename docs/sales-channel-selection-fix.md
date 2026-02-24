# Sales Channel Selection Fix (`setProfile`)

## Context

We observed unexpected sales channel switches (for example, `1 -> 2`) when users changed address and/or cost center, even when the organization trade policy was set to **None**.

Investigation showed that some organization documents store **None** as:

- `salesChannel: "0"`

The sales channel list API (`/api/catalog_system/pvt/saleschannel/list`) was returning the correct list. The issue was in local selection/fallback logic inside session transform (`setProfile`).

## Root Cause

In `node/resolvers/Routes/index.ts`, when organization `salesChannel` was empty/invalid, the code defaulted to the first active channel from catalog list.

This fallback could run during session reprocessing (address/cost center changes), overwriting the current session context.

Additionally:

- `"0"` (None) was not treated as "unset"
- existing session `public.sc` was not used as an input signal for preserving context

## Changes Made

### 1) Read current session sales channel in transformation input

Updated `vtex.session/configuration.json`:

- Added `public.sc` to input fields so session transform can access the current channel.

### 2) Treat organization `"0"` as no explicit trade policy

Updated `node/resolvers/Routes/index.ts` in sales channel resolution:

- Consider organization sales channel as **unset** when:
  - `null`
  - `undefined`
  - empty string
  - `"0"` (None)

### 3) Preserve current session channel when org policy is None

When org has no explicit policy:

- If current session `public.sc` is active, keep it.
- If no valid current session channel exists, do not force a new one.

### 4) Keep fallback only for invalid explicit org policies

When org has an explicit sales channel but it is invalid/inactive:

- fallback remains to first active channel.

### 5) Guard region lookup against missing channel

`getRegionId` now runs only when a sales channel is resolved, preventing unsafe `toString()` usage on empty values.

## Why This Was Needed

Expected business behavior for **Trade Policy = None** is to allow channel resolution by storefront/binding/session context, not force a catalog-first fallback.

The previous logic violated this expectation during session transformations.

## Files Changed

- `vtex.session/configuration.json`
- `node/resolvers/Routes/index.ts`

## Validation Notes

- Local `yarn --cwd node lint` currently fails due TypeScript version mismatch in dependencies (`typescript@3.9.7` vs newer dependency typings, e.g. axios TS 4.1+ syntax).
- This is environment/dependency tooling debt and not introduced by this functional change.

