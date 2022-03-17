# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
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
