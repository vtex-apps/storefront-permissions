# B2B Waffle
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

The **Storefront Permissions** is the main dependency for b2b modules, it contains Roles and User management

## Functionalities
- Manage Roles
- Manage Users

## Configuration

1. [Install](https://vtex.io/docs/recipes/development/installing-an-app/) the storefront-permissions app by running `vtex install vtex.storefront-permissions` in your terminal.
2. At the Admin, navigate to **ACCOUNT SETTINGS > Storefront Permissions**.

3. Create Roles

4. Create Users

## Advanced app integration

How to integrate your app with **Storefront Permissions** and make it available within the Role management

- Add `vtex.storefront-permissions` to the `manifest.json` file under the **builders** property
```JSON
"builders": {
    "vtex.storefront-permissions": "0.x"
  }
```

- Create a folder `vtex.storefront-permissions` on the root
- Inside the `vtex.storefront-permissions` folder, create a `configuration.json` file

The content to this file should be in this format containing the name of your App and the features, remember to not use space or special characters as value for the features

```JSON
{
  "name": "My awesome app",
  "features": [
    {
      "label": "View",
      "value": "view-awesome-things"
    },
    {
      "label": "Create",
      "value": "create-awesome-things"
    },
    {
      "label": "Delete",
      "value": "delete-awesome-things"
    },
    {
      "label": "Special Access",
      "value": "allow-special-access"
    }
  ]
}
```
Once your app is installed, this information will be automatically loaded on the **Storefront Permissions** Roles section

Now that your app is integrated, and you have associated your test user to a Role containing your app's permission, you can write a GraphQL query on your app to check the current user's permission within the context of your app, it's not necessary to declare your app name nor user credentials, the query will take care of these details

```graphql
query permissions {
  checkUserPermission @context(provider: "vtex.storefront-permissions")
}
```

The response will be a simple list with all the permissions the current user has on the current app

```JSON
{
  "data":{
    "checkUserPermission":["view-awesome-things","create-awesome-things","delete-awesome-things"]
  }
}
```
