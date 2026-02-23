# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Cost center address selection (opt-in):** New app setting `enableCostCenterAddressSelection`. When enabled, the session accepts `costCenterAddressId` in the public namespace and uses the selected cost center address for region, shipping, and document type (e.g. Brazil CPF). When disabled or when no valid id is sent, the first cost center address is used. Output `costCenterAddressId` in the storefront-permissions namespace reflects the selected address; if the client sends `costCenterAddressId` as empty or null, the output is set to empty so the session reflects a cleared selection.
- **Region overwrite (opt-in):** New app setting `enableRegionOverwrite`. When enabled and the client sends `allowRegionOverwrite` with both `public.postalCode` and `public.country` set, we set `public.regionId` to empty and do not update the cart shipping address; checkout-session backend is responsible for setting `checkout.regionId` from those values. Requires both postalCode and country in the public namespace to take effect.
- Session input (public) now accepts `costCenterAddressId`, `allowRegionOverwrite`, `postalCode`, and `country`. Session output (storefront-permissions) includes `costCenterAddressId`; output (public) `regionId` is explicitly set to empty when region overwrite is active.
- LRU cache for app settings (manifest settingsSchema) to reduce Apps API calls on `setProfile` (5 min TTL). See `docs/COST_CENTER_ADDRESS_AND_REGION.md`.
- Documentation: `docs/COST_CENTER_ADDRESS_AND_REGION.md` describing cost center address selection and region overwrite logic.

### Changed

- `setProfile` now reads app settings via cached getter in parallel with organization/cost center data to support the new feature flags without extra latency.
- When region overwrite is active, `response.public.regionId` is explicitly set to empty so the session merge correctly reflects that storefront-permissions is not providing a region (checkout-session will derive it from postalCode/country).

## [3.2.3] - 2026-02-22

### Fixed

- Crowdin configuration file

## [3.2.2] - 2026-01-29

### Changed

- Updated GitHub Actions quality-engineering workflow to v3.1.0

## [3.2.1] - 2025-12-02

### Changed
- Change checkUserPermission error logs on the graphql framework to warn level

## [3.2.0] - 2025-10-09

### Added
- Introduced the getOrganizationsPaginatedByEmail function to retrieve organizations with pagination, preventing timeouts.

## [3.1.0] - 2025-10-07

## [3.0.1] - 2025-10-07
### Feature
- Added license manager checks to certain queries and all mutations so only users with b2b organizations view and edit are able to interact with the information from the organizations.

## [3.0.0] - 2025-09-24

### Changed
- Update dependency major version. If you are updating to this major version, make sure to update the following apps (if you have then installed) to the following major versions:
    - vtex.b2b-admin-customers@2.x
    - vtex.b2b-checkout-settings@3.x
    - vtex.b2b-my-account@2.x
    - vtex.b2b-orders-history@2.x
    - vtex.b2b-organizations@3.x
    - vtex.b2b-organizations-graphql@2.x
    - vtex.b2b-quotes@3.x
    - vtex.b2b-quotes-graphql@4.x
    - vtex.b2b-suite@2.x
    - vtex.b2b-theme@5.x
    - vtex.storefront-permissions-components@2.x
    - vtex.storefront-permissions-ui@1.x

## [2.2.0] - 2026-02-22

### Added

- **Cost center address selection (opt-in):** New app setting `enableCostCenterAddressSelection`. When enabled, the session accepts `costCenterAddressId` in the public namespace and uses the selected cost center address for region, shipping, and document type (e.g. Brazil CPF). When disabled or when no valid id is sent, the first cost center address is used. Output `costCenterAddressId` in the storefront-permissions namespace reflects the selected address; if the client sends `costCenterAddressId` as empty or null, the output is set to empty so the session reflects a cleared selection.
- **Region overwrite (opt-in):** New app setting `enableRegionOverwrite`. When enabled and the client sends `allowRegionOverwrite` with both `public.postalCode` and `public.country` set, we set `public.regionId` to empty and do not update the cart shipping address; checkout-session backend is responsible for setting `checkout.regionId` from those values. Requires both postalCode and country in the public namespace to take effect.
- Session input (public) now accepts `costCenterAddressId`, `allowRegionOverwrite`, `postalCode`, and `country`. Session output (storefront-permissions) includes `costCenterAddressId`; output (public) `regionId` is explicitly set to empty when region overwrite is active.
- LRU cache for app settings (manifest settingsSchema) to reduce Apps API calls on `setProfile` (5 min TTL). See `docs/COST_CENTER_ADDRESS_AND_REGION.md`.
- Documentation: `docs/COST_CENTER_ADDRESS_AND_REGION.md` describing cost center address selection and region overwrite logic.

### Changed

- `setProfile` now reads app settings via cached getter in parallel with organization/cost center data to support the new feature flags without extra latency.
- When region overwrite is active, `response.public.regionId` is explicitly set to empty so the session merge correctly reflects that storefront-permissions is not providing a region (checkout-session will derive it from postalCode/country).

## [2.1.0] - 2025-07-17

### Added
- Add new setCurrentPriceTable mutation that allows a specific price table to be selected for the user

## [2.0.0] - 2025-05-27

### Changed
- Update dependency major version. If you are updating to this major version, make sure to update the following apps (if you have then installed) to the following major versions:
    - vtex.b2b-admin-customers@1.x
    - vtex.b2b-checkout-settings@2.x
    - vtex.b2b-my-account@1.x
    - vtex.b2b-orders-history@1.x
    - vtex.b2b-organizations@2.x
    - vtex.b2b-organizations-graphql@1.x
    - vtex.b2b-quotes@2.x
    - vtex.b2b-quotes-graphql@3.x
    - vtex.b2b-suite@1.x
    - vtex.b2b-theme@4.x
    - vtex.storefront-permissions-components@1.x
    - vtex.storefront-permissions-ui@2.x

### Removed
- Reverted version 1.46.0

## [1.46.0] - 2025-05-22

### Added
- New mutation `setCurrentPriceTable` to allow users to select a specific price table from their organization's available price tables
- New field `selectedPriceTable` to `b2b_users` schema to persist user's price table preference
- Enhanced price table handling in `setProfile` to prioritize user's selected price table in the response

### Changed
- Add `selectedPriceTable` to `b2b_users` schema

## [1.45.3] - 2025-04-22

### Changed

- Change the way to retrieve the customer from Master Data using custom client
- Change the way to retrieve the organization by id from Master Data using custom client

## [1.45.2] - 2025-02-06

### Fixed

- Clear cart only changed Hash (OrgId+CostId)

## [1.45.1] - 2024-10-28

### Fixed

- Change the way to check if the cost center is valid

## [1.45.0] - 2024-10-28

### Changed

- Changed the token validation directive of the getUserByEmail operation

## [1.44.13] - 2024-10-15

### Fixed
- Force setProfile to use a valid cost center
- Increase timeout to 45 seconds

## [1.44.12] - 2024-10-14

### Added

- getRegionId now includes geographic coordinates in parameters when available

## [1.44.11] - 2024-10-10

### Fixed

- Error changing Cost Center after placing order

## [1.44.10] - 2024-10-07

### Fixed

- Use return instead of throwing a duplicate email error.

## [1.44.9] - 2024-10-03

### Fixed

- Adjust session provider early return logic

## [1.44.8] - 2024-10-02

### Fixed

- In session provider, return early if storeUserEmail is not populated

## [1.44.7] - 2024-09-25

### Fixed

- Remove unnecessary b2b_users storage on vbase

## [1.44.6] - 2024-09-05

### Fixed

- Add await to requests to properly handle inactive organizations on login

## [1.44.5] - 2024-09-04

### Fixed

- Provide app token on calls to b2b-organizations-graphql app

## [1.44.4] - 2024-09-03

### Fixed

- Add sort to searchDocumentsWithPaginationInfo at getAllUsers

## [1.44.3] - 2024-08-22

### Fixed

- add new auth metric field

## [1.44.2] - 2024-08-21

### Fixed

- addUser function to not accept invalid cost center

## [1.44.1] - 2024-08-19

### Added

- Session audit metrics

## [1.44.0] - 2024-08-14

### Changed

- Changed the token validation directive of some operations

## [1.43.5] - 2024-08-08

### Fixed

- Storefront considers the active organizations when setting the user's profile

## [1.43.4] - 2024-08-07

### Changed

- Changed the token validation directive of some operations

## [1.43.3] - 2024-07-31

### Changed

- Changed the token validation directive of some operations

## [1.43.2] - 2024-07-29

### Added

- Add enforcement of new validation for admin and api tokens
- Add more details to admin and api token validation metric

## [1.43.1] - 2024-07-24

### Changed

- Changed the token validation directive of some operations

## [1.43.0] - 2024-07-23

### Added

- Add admin validation directive

## [1.42.0] - 2024-07-17

### Fixed

- Get tokens from headers when necessary

## [1.41.1] - 2024-07-15

### Added

- Add validation metrics for admin and api tokens

## [1.41.0] - 2024-07-01

### Added

- Add token validation directive

## [1.40.7] - 2024-06-11

### Fixed

- Provide correct tokens to clients

## [1.40.6] - 2024-05-28

### Changed

- Check user is part of buyer org instead of "active" on checkUserAccess directive

## [1.40.5] - 2024-05-22

### Changed

- Improved metrics and logging for checkUserAccess and checkAdminAccess directives

## [1.40.4] - 2024-04-29

### Added

- Add token validation logs

### Removed

- Reverted changes from versions 1.40.3, 1.40.2 and 1.40.1

## [1.40.3] - 2024-04-24

### Fixed

- Provide correct auth tokens to clients

## [1.40.2] - 2024-04-19

### Fixed

- Fix auth issue by adding additional admin token check to checkUserAccess and checkAdminAccess

## [1.40.1] - 2024-04-18

### Fixed

- Fix auth issue by adding role check to checkUserAccess directive

## [1.40.0] - 2024-03-20

### Changed

- Changed getUsersByEmail to filter OrgId and CostId

## [1.39.4] - 2024-03-14

### Changed

- Changed to remove space instead of character

## [1.39.3] - 2024-02-27

### Fixed

- Adjust b2b-organizations-graphql integration

## [1.39.2] - 2024-02-26

### Changed

- Add intro description about Session Watcher

## [1.39.1] - 2024-02-09

### Fixed

- Fix IsCorporate in SetProfile

## [1.39.0] - 2024-02-06

### Added

- New `ignoreB2BSessionData` mutation to allow a user to leave/resume the B2B context

## [1.38.0] - 2023-12-14

### Added

- add directive to validate auth token for some operations

## [1.37.3] - 2023-12-07

### Fixed

- Add 'isDisposable' property to create address requests, indicating whether the address is disposable to prevent duplicates.

## [1.37.2] - 2023-11-10

### Fixed

- Reduce sync roles, remove from checkUserPermissions and listRoles

## [1.37.1] - 2023-11-09

### Fixed

- Remove get permissions from access audit metrics

## [1.37.0] - 2023-11-06

### Added

- add an authentication metric to check if the access is authenticated

## [1.36.0] - 2023-08-09

### Added

- Change Team action metrics

## [1.35.3] - 2023-07-19

### Fixed

- Fix on check impersonation query

## [1.35.2] - 2023-07-13

### Changed

- Edited README.md file

## [1.35.1] - 2023-06-29

### Fixed

- Removing the document on orderform in case of business/corporate profile data
- Removing all the non digits from the business document to prevent checkout errors

## [1.35.0] - 2023-05-31

### Added

- Added sellers by cost center feature

## [1.34.1] - 2023-05-12

### Fixed

- Fix error when accessing undefined "cl" variable

## [1.34.0] - 2023-05-11

### Added

- Added the settings to allow the admin disable the facets on session

## [1.33.4] - 2023-05-11

### Fixed

- Fixed some issues around phone number order form

## [1.33.3] - 2023-05-08

### Fixed

- Fixed issue where `documentType` is always set to cpf

## [1.33.2] - 2023-05-03

### Fixed

- geoCoordinates empty

## [1.33.1] - 2023-04-21

### Fixed

- Fixed impersonation user

## [1.33.0] - 2023-04-20

### Fixed

- Fix on impersonation user

## [1.32.0] - 2023-04-19

### Added

- Added the x-b2b-senderapp header to fix problems with the new B2B API

## [1.31.5] - 2023-04-11

### Fixed

- Fixed clear call async calls

### Removed

- [ENGINEERS-1247] - Disable cypress tests in PR level

### Changed

- Run schedule job only on saturday

## [1.31.4] - 2023-03-17

### Fixed

- Fixed the `setProfile` to clear the cart properly
- Improved calls on set profile in order to get faster response

## [1.31.3] - 2023-03-01

### Fixed

- Changed the scroll to search with pagination

## [1.31.2] - 2023-02-27

### Fixed

- `setProfile` adding sku 1 to the cart to set sales channel when the cart is empty
- `setProfile` losing item attachments after login

## [1.31.1] - 2023-02-24

### Fixed

- Fixed the getCoordinates shipping data and removing unnecessary sync calls

## [1.31.0] - 2023-02-23

### Added

- Added a feature when the user logs in or changes the current organization.

## [1.30.0] - 2023-02-09

### Added

- Added sellers to set profile filter

## [1.29.10] - 2023-01-27

### Fixed

- Bug fixed on getUserByEmail

## [1.29.9] - 2023-01-24

### Fixed

- JSON web token updated

## [1.29.8] - 2023-01-17

### Fixed

- Fixed on updating the sales channel by converting to string rather than number
- Fixed on updating the sales channel and was adding a element automatically

## [1.29.7] - 2023-01-06

### Fixed

- Vtex Setup

## [1.29.6] - 2022-12-23

### Changed

- Updated cypress strategy

### Fixed

- bugfix when Sales Channel is inactive or unlinked to account.

## [1.29.5] - 2022-12-19

### Fixed

- The bug is fixed when the active user is linked to an inactive user but has active organizations, so, setProfile finds the first active organization and sets it as active for the user, and proceeds with the login.

## [1.29.4] - 2022-12-09

### Changed

- Disable video for cypress tests

### Fixed

- Fix on getting all users into getActiveUserByEmail by getAllUsersByEmail

## [1.29.3] - 2022-11-30

### Fixed

- getOrganizationsByEmail is returning all users instead of only first 50 records

## [1.29.2] - 2022-11-28

### Fixed

- Fix setCurrentOrganization mutation

## [1.29.1] - 2022-11-15

### Changed

- Enable video for cypress tests

### Fixed

- minimist package updated from 1.2.5 to 1.2.7 due a critical security vulnerability

## [1.29.0] - 2022-11-08

### Added

- Added the functionality to the storefront permissions to change the sales channel according to the Organization

## [1.28.1] - 2022-11-03

### Changed

- Join multiple priceTables with `,` instead of `;`

## [1.28.0] - 2022-10-26

### Added

- Force the business document and state registration on setProfile method

## [1.27.0] - 2022-10-19

### Changed

- Split bindings testcase into two files

### Fixed

- Added lastName field to CL masterdata add request

## [1.26.0] - 2022-10-07

### Added

- Marketing Tags to setProfile and attaching to the orderForm

### Changed

- GitHub reusable workflow and Cy-Runner updated to version 2

## [1.25.1] - 2022-09-30

### Fixed

- Bug fixed on set current organization

## [1.25.0] - 2022-09-29

### Added

- As part of one-to-many feature, was added a mutation to set the current organization to the user

## [1.24.0] - 2022-09-12

### Changed

- Changed the validation of the add user

### Added

- Added a feature to allow adding users to many organizations

## [1.23.0] - 2022-08-09

### Changed

- App Review: Added logging, fixed security issues and code cleanup

## [1.22.2] - 2022-08-03

### Fixed

- Fixed `getUserByEmail` query

## [1.22.1] - 2022-07-12

### Fixed

- Fixed on update the user data, and it disappeared from the list

## [1.22.0] - 2022-06-27

### Added

- Support for `tradeName` field on user's organization and `phoneNumber` field on user's cost center

## [1.21.1] - 2022-06-22

### Added

- Add error messages improvement

## [1.21.0] - 2022-06-17

### Added

- Added a mutation to check if the schema is correctly configured.
- Created a constants file

## [1.20.0] - 2022-05-31

### Added

- Added a graphql query to get all users by using the scroll MD function

## [1.19.0] - 2022-05-09

### Added

- Added the pagination to listUsers query

## [1.18.1] - 2022-04-28

### Fixed

- Fixed on checking if the user already exists

## [1.18.0] - 2022-04-12

### Added

- Validation if the user is already on MD and check if the orgId is different

## [1.17.1] - 2022-04-11

### Fixed

- HOTFIX on addUser

## [1.17.0] - 2022-04-07

### Added

- create a new Mutation to add a single user
- create a new Mutation to update a single user
- optimize code / structure

## [1.16.0] - 2022-04-05

### Added

- Support for `businessDocument` field on user's cost center

### Fixed

- Don't await orderForm update promises in session hook to avoid timeouts
- Check user impersonation status via session properties rather than orderForm
- Adjust conditional in `checkImpersonation` query so that only data related to B2B impersonation solution is returned

## [1.15.0] - 2022-04-01

### Added

- Support for user impersonation via Telemarketing app

### Changed

- `checkUserPermission` will return a superset of the original user's and the impersonated user's permissions, if impersonation is active. If the original user has a role, that user's role will be returned. If not, the impersonated user's role will be returned

## [1.14.4] - 2022-03-21

### Changed

- Reviewed README.md file

## [1.14.3] - 2022-03-17

### Changed

- New version to re-deploy

## [1.14.2] - 2022-03-17

### Removed

- Dependencies `search-segment-resolver` and `search-segment-graphql`

### Added

- Addition information to the `impersonateUser` Mutation

## [1.14.1] - 2022-03-16

- Fix on shipping data payload

## [1.14.0] - 2022-03-08

### Changed

- `checkUserPermissions` will now always return the "parent" user's role and permissions regardless of impersonation
- If impersonating a user, their organization and cost center will be applied to the session (and therefore their price list, catalog, etc)

## [1.13.2] - 2022-02-28

## [1.13.1] - 2022-02-25

### Fixed

- Changed the role handling from masterdata to vbase to avoid duplicated entries

## [1.13.0] - 2022-02-02

### Added

- GraphQL query `getSessionWatcher` and mutation `sessionWatcher`

## [1.12.2] - 2022-02-01

### Added

- Better logging

## [1.12.1] - 2022-01-21

### Fixed

- When adding a new user, check if their email already exists in MD

## [1.12.0] - 2022-01-18

### Added

- `checkImpersonation` Graphql query

## [1.11.0] - 2022-01-10

### Added

- `impersonateUser` mutation

## [1.10.1] - 2022-01-04

### Fixed

- `checkUserPermissions` query will no longer throw an error if the user's role has no enabled permissions for the app making the request

## [1.10.0] - 2021-12-21

### Added

- Prevent login for users in inactive organizations by throwing error in `setProfile` route handler

## [1.9.1] - 2021-11-22

### Fixed

- When syncing roles and features, new modules are now added to existing modules instead of replacing them

## [1.9.0] - 2021-11-09

### Added

- Optional `permissionId` variables for `listUsers` query

## [1.8.2] - 2021-11-02

### Fixed

- Not loading saved roles from checkPermissions

## [1.8.1] - 2021-10-28

### Fixed

- Slug being updated if a Role name is changed

## [1.8.0] - 2021-10-26

### Added

- Optional `organizationId` and `costCenterId` variables for `listUsers` query

## [1.7.0] - 2021-10-26

### Added

- `saveUser` now creates users to the CL entity

### Changed

- Default role labels from `Admin`, `Approver` and `Buyer` to `Organization Admin`, `Organization Approver` and `Organization Buyer`

## [1.6.1] - 2021-10-25

## [1.6.0] - 2021-10-13

### Added

- `vtex.search-session`, `vtex.search-segment-graphql` and `vtex.search-segment-resolver` as dependency

## [1.5.2] - 2021-10-13

### Fixed

- Collection facets

## [1.5.1] - 2021-10-12

### Updated

- Doc update

### Fixed

- ListFeatures error when there's no apps depending on storefront-permissions

## [1.5.0] - 2021-10-05

### Added

- Sets Organization, Costcenter, Address, PriceTables on login

## [1.4.3] - 2021-09-15

### Added

- Policy for other apps to call this app's GraphQL routes
- `organization`, `costCenter`, `collections` are now populated in user's session

## [1.4.2] - 2021-09-07

### Added

- Getting `priceTables` from `vtex.b2b-organizations-graphql`

## [1.4.1] - 2021-09-03

- Ignore errors when using `withUserPermissions`

## [1.4.0] - 2021-08-31

### Added

- Organization and Cost Center dropdown
- GraphQL Directive `withUserPermissions`

## [1.3.3] - 2021-08-16

## [1.3.2] - 2021-08-13

### Fixed

- MD Schema

## [1.3.1] - 2021-08-13

### Added

- Exception for `vtex.storefront-permissions-ui` requests

## [1.3.0] - 2021-08-12

### Added

- Exported component `StorefrontPermissions` to be imported by `vtex.admin-customers`

### Fixed

- Duplicated Role
- License Manager insertion for new vtex users

## [1.2.0] - 2021-08-09

### Changed

- Turning it into a backend layer app

## [1.1.0] - 2021-08-02

### Added

- new Graphql query `hasUsers`

## [1.0.1] - 2021-08-02

### Fixed

- User search at the admin (Dependency change)

## [1.0.0] - 2021-08-02

### Removed

- `billingOpstions` from `manifest.json`
- Option to **Create** and **Delete** roles from the Admin

### Added

- Roles autosync from dependent Apps

### Changed

- `checkUserPermission` return structure

## [0.0.2] - 2021-07-26

### Removed

- `totalNumberOfUsers` from graqhql query
