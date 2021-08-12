# B2B Waffle

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

The **Storefront Permissions** is the main dependency for b2b modules, it contains Roles and User management
This APP doesn't containg an interface, for that, install either `vtex.admin-customers` or `vtex.storefront-permissions-ui`

The `vtex.storefront-permissions-ui` will allow you to also edit permissions for specific roles


## Functionalities

- Manage Roles
- Manage Users

## Configuration

1. [Install](https://vtex.io/docs/recipes/development/installing-an-app/) the storefront-permissions app by running `vtex install vtex.storefront-permissions` in your terminal.
2. At the Admin, navigate to **ACCOUNT SETTINGS > Storefront Permissions**.

3. Create Users

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
| Admin       | `customer-admin`       |
| Approver    | `customer-approver`    |
| Buyer       | `customer-buyer`       |

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
  hasUsers(slug: "sales-admin") @context(provider: "vtex.storefront-permissions")
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
