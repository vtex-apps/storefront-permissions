# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- getRoleAndPermissionsByEmail is returning correct Role of the active user

## [1.29.6] - 2022-12-23

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
