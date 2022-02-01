# Storefront Permissions

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

The **Storefront Permissions** is the main dependency for b2b modules, it handles user's permissions based on its Roles
This APP doesn't containg an interface, for managing users, install `vtex.admin-customers` for that, you can opcionally install `vtex.storefront-permissions-ui` to adjust Apps Permissions to specific Roles

## Functionalities

- Centralize App Permissions
- Manage Roles Permissions
- Impersonation

## Configuration

1. [Install](https://vtex.io/docs/recipes/development/installing-an-app/) the storefront-permissions app by running `vtex install vtex.storefront-permissions` in your terminal.
2. At the Admin, navigate to **ACCOUNT SETTINGS > Storefront Permissions**.

3. Manage Roles

## Advanced app integration

How to integrate your app with **Storefront Permissions** and make it available within the Role management

- Add `vtex.storefront-permissions` to the `manifest.json` file under the **builders** property

```JSON
"builders": {
    "vtex.storefront-permissions": "1.x"
  }
```

- Create a folder `vtex.storefront-permissions` on the root
- Inside the `vtex.storefront-permissions` folder, create a `configuration.json` file

The content to this file should be in this format containing the name of your App and the features, remember to not use space or special characters as value for the features, you can also define default Roles that will be able to use each feature

```JSON
{
  "name": "My awesome app",
  "features": [
    {
      "label": "View",
      "value": "view-awesome-things",
      "roles": ["store-admin","sales-admin","sales-manager","sales-representative","customer-admin","customer-approver","customer-buyer"]
    },
    {
      "label": "Create",
      "value": "create-awesome-things",
      "roles": ["store-admin","sales-admin","sales-manager","sales-representative"]
    },
    {
      "label": "Delete",
      "value": "delete-awesome-things",
      "roles": ["store-admin","sales-admin","sales-manager","sales-representative"]
    },
    {
      "label": "Special Access",
      "value": "allow-special-access",
      "roles": ["store-admin","sales-admin"]
    }
  ]
}
```

### Available Roles

| Role                 | Key                    |
| -------------------- | ---------------------- |
| Store Admin          | `store-admin`          |
| Sales Admin          | `sales-admin`          |
| Sales Manager        | `sales-manager`        |
| Sales Representative | `sales-representative` |
| Customer Admin                | `customer-admin`       |
| Customer Approver             | `customer-approver`    |
| Customer Buyer                | `customer-buyer`       |

Once your app is installed, this information will be automatically loaded on the **Storefront Permissions** Roles section

Now that your app is integrated, and you have associated your test user to a Role containing your app's permission, you can write a GraphQL query on your app to check the current user's permission within the context of your app, it's not necessary to declare your app name nor user credentials, the query will take care of these details

### Graphql queries

`checkUserPermission`

```graphql
query permissions {
  checkUserPermission @context(provider: "vtex.storefront-permissions") {
    role {
      id
      name
      slug
    }
    permissions
  }
}
```

The response will be a simple list with all the permissions the current user has on the current app

```JSON
{
  "data":{
    "checkUserPermission": {
      "role": {
        "id": "00549c22-f39d-11eb-82ac-0a55b612700f",
        "name": "Admin",
        "slug": "customer-admin"
      },
      "permissions": ["view-awesome-things","create-awesome-things","delete-awesome-things"]
    }
  }
}
```

`hasUsers`

```graphql
query HasUsers {
  hasUsers(slug: "sales-admin")
    @context(provider: "vtex.storefront-permissions")
}
```

The response will be a boolean

```JSON
{
  "data": {
    "hasUsers": true
  }
}
```

`checkImpersonation`

```graphql
query checkImpersonation {
  checkImpersonation {
    firstName
    lastName
    email
    userId
    error
  }
}
```

The response will be a boolean

```JSON
{
  "data": {
    "checkImpersonation": {
      "firstName": "Andrew",
      "lastName": "Smith",
      "email": "testemail@mail.com",
      "userId": "aaaaa-bbbb-cccc-dddd-eeeee",
      "error": null
    }
  }
}
```

### Graphql mutation

Use `userId` to impersonate, to remove impersonation send an empty `userId` instead

```graphql
mutation impersonateUser($userId: ID)
@context(provider: "vtex.storefront-permissions") {
  impersonateUser(userId: $userId) {
    status
    message
  }
}
```

### Troubleshooting

By default the app settings has the Session Watcher active, it's used to detect changes to authentication, orderFormId or impersonation request. When active, sets priceTable, Collection, Cart Settings, Organizations and Cost Center to the session

If loaded via dependency, it may cause unecessary use of resources, to turn this feature off, head over to `{accountName}.myvtex.com/admin/apps/vtex.storefront-permissions@1.x/setup/` uncheck the **YES** option and click **SAVE**

