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
}

export const resolvers = {
  Routes: {
    setProfile: async (ctx: Context) => {
      ctx.set('Content-Type', 'application/json')
      ctx.set('Cache-Control', 'no-cache, no-store')
      const body: any = await json(ctx.req)
      const {
        clients: { graphqlServer },
      } = ctx

      console.log('VTEX SESSION REQUEST BODY =>', body)

      const res = {
        'storefront-permissions': {
          organization: {
            value: '',
          },
          costcenter: {
            value: '',
          },
          priceTables: {
            value: '',
          },
        },
        public: {
          facets: {
            value: '',
          },
        },
      }

      const email = body?.authentication?.storeUserEmail?.value ?? null

      if (email) {
        const [user]: any = await getUserByEmail(null, { email }, ctx)

        console.log('USER =>', user)

        if (user?.orgId) {
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
            organizationResponse?.data?.getOrganizationById?.priceTables?.length
          ) {
            res[
              'storefront-permissions'
            ].priceTables.value = `${organizationResponse.data.getOrganizationById.priceTables.join(
              ';'
            )};`
          }

          console.log('organizationResponse =>', organizationResponse)
          // res['storefront-permissions'].priceTables.value = ''
          // res.public.facets.value = ''
          // res['storefront-permissions'].organization.value = ''
          // res['storefront-permissions'].costcenter.value = ''
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
