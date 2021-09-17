/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'

import { deleteRole, saveRole } from './Mutations/Roles'
import { getRole, listRoles, hasUsers } from './Queries/Roles'
import { deleteUser, saveUser } from './Mutations/Users'
import { getFeaturesByModule, listFeatures } from './Queries/Features'
import { getAppSettings } from './Queries/Settings'
import {
  getUser,
  getUserByEmail,
  listUsers,
  checkUserPermission,
  getUserById,
} from './Queries/Users'

const getAppId = (): string => {
  return process.env.VTEX_APP_ID ?? ''
}

const QUERIES = {
  getOrganizationById: `query Organization($id: ID!){
    getOrganizationById(id: $id) @context(provider: "vtex.b2b-organizations-graphql"){
      priceTables
      collections {
        id
      }
    }
  }`,
  getCostCenterById: `query Costcenter($id: ID!) {
    getCostCenterById(id: $id) {
      addresses {
        addressId
        addressType
        addressQuery
        postalCode
        country
        receiverName
        city
        state
        street
        number
        complement
        neighborhood
        geoCoordinates
        reference
      }
    }
  }`,
}

export const resolvers = {
  Routes: {
    setProfile: async (ctx: Context) => {
      ctx.set('Content-Type', 'application/json')
      ctx.set('Cache-Control', 'no-cache, no-store')
      const body: any = await json(ctx.req)
      const {
        clients: { graphqlServer, checkout },
      } = ctx

      const res = {
        'storefront-permissions': {
          organization: {
            value: '',
          },
          costCenter: {
            value: '',
          },
          collections: {
            value: '',
          },
          priceTables: {
            value: '',
          },
        },
        // public: {
        //   facets: {
        //     value: '',
        //   },
        // },
      }

      const email = body?.authentication?.storeUserEmail?.value ?? null
      const orderFormId = body?.checkout?.orderFormId?.value ?? null

      console.log('VTEX SESSION REQUEST BODY =>', body)
      console.log('EMAIL =>', email)
      console.log('OrderFormId =>', orderFormId)

      if (email) {
        const [user]: any = await getUserByEmail(null, { email }, ctx)

        console.log('USER =>', user)

        if (user?.clId) {
          const clUser = await getUserById(null, { id: user.clId }, ctx)

          console.log('CLUser =>', clUser)
          if (clUser) {
            await checkout
              .updateOrderFormProfile(orderFormId, clUser)
              .catch((err) => {
                console.log('Error saving clientProfileData =>', err)
              })
          }
        }

        if (user?.orgId) {
          res['storefront-permissions'].organization.value = user.orgId

          const organizationResponse: any = await graphqlServer.query(
            QUERIES.getOrganizationById,
            { id: user.orgId },
            {
              persistedQuery: {
                provider: 'vtex.b2b-organizations-graphql@0.x',
                sender: 'vtex.storefront-permissions@0.x',
              },
            }
          )

          if (
            organizationResponse?.data?.getOrganizationById?.collections?.length
          ) {
            const collectionsArray =
              organizationResponse.data.getOrganizationById.collections.map(
                (collection: any) => collection.id
              )

            res[
              'storefront-permissions'
            ].collections.value = `${collectionsArray.join(';')};`
          }

          if (
            organizationResponse?.data?.getOrganizationById?.priceTables?.length
          ) {
            res[
              'storefront-permissions'
            ].priceTables.value = `${organizationResponse.data.getOrganizationById.priceTables.join(
              ';'
            )};`
          }
        }

        if (user?.costId) {
          res['storefront-permissions'].costCenter.value = user.costId
        }
      }

      console.log('OUTPUT =>', JSON.stringify(res))

      ctx.response.body = res

      ctx.response.status = 200
    },
  },
  Mutation: {
    deleteRole,
    saveRole,
    deleteUser,
    saveUser,
    saveAppSettings: async (_: any, __: any, ctx: Context) => {
      const {
        clients: { apps },
      } = ctx

      const app: string = getAppId()

      const newSettings = {}

      try {
        await apps.saveAppSettings(app, newSettings)

        return { status: 'success', message: '' }
      } catch (e) {
        return { status: 'error', message: e }
      }
    },
  },
  Query: {
    getRole,
    listRoles,
    hasUsers,
    getFeaturesByModule,
    listFeatures,
    getUser,
    getUserByEmail,
    listUsers,
    checkUserPermission,
    getAppSettings,
  },
}
