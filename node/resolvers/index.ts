/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'
import { ForbiddenError } from '@vtex/api'

import { deleteRole, saveRole } from './Mutations/Roles'
import { getRole, listRoles, hasUsers } from './Queries/Roles'
import { deleteUser, saveUser, impersonateUser } from './Mutations/Users'
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
      status
      priceTables
      collections {
        id
      }
    }
  }`,
  getCostCenterById: `query Costcenter($id: ID!) {
    getCostCenterById(id: $id) {
      paymentTerms {
        id
        name
      }
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
    checkPermissions: async (ctx: Context) => {
      ctx.set('Content-Type', 'application/json')
      await getAppSettings(null, null, ctx)

      const params: any = await json(ctx.req)

      let ret

      if (!params?.app) {
        throw new Error('App not defined')
      }

      if (!params?.email) {
        throw new Error('Email not defined')
      }

      const userData: any = await getUserByEmail(
        null,
        { email: params.email },
        ctx
      )

      if (!userData.length) {
        throw new Error('User not found')
      }

      if (userData.length) {
        const userRole: any = await getRole(
          null,
          { id: userData[0].roleId },
          ctx
        )

        if (!userRole) {
          throw new Error('Role not found')
        }

        if (userRole) {
          const currentModule = userRole.features.find((feature: any) => {
            return feature.module === params.app
          })

          ret = {
            role: userRole,
            permissions: currentModule?.features ?? [],
          }
        }
      }

      ctx.response.body = ret

      ctx.response.status = 200
    },
    setProfile: async (ctx: Context) => {
      ctx.set('Content-Type', 'application/json')
      ctx.set('Cache-Control', 'no-cache, no-store')
      const body: any = await json(ctx.req)
      const {
        clients: { graphqlServer, checkout, profileSystem },
        vtex: { logger },
      } = ctx

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
          storeUserId: {
            value: '',
          },
          storeUserEmail: {
            value: '',
          },
        },
        public: {
          facets: {
            value: '',
          },
        },
      }

      const impersonate = body?.public?.impersonate?.value ?? null
      const email = body?.authentication?.storeUserEmail?.value ?? null
      const orderFormId = body?.checkout?.orderFormId?.value ?? null

      if (impersonate) {
        const profile: any = await profileSystem.getProfileInfo(impersonate)

        if (profile) {
          res['storefront-permissions'].storeUserId.value = profile.userId
          res['storefront-permissions'].storeUserEmail.value = profile.email
        }
      }

      if (email) {
        const [user]: any = await getUserByEmail(null, { email }, ctx)

        if (user?.clId) {
          const clUser = await getUserById(null, { id: user.clId }, ctx)

          if (clUser && orderFormId) {
            await checkout
              .updateOrderFormProfile(orderFormId, clUser)
              .catch((err) => {
                logger.error(err)
              })
          }
        }

        if (user?.orgId) {
          res['storefront-permissions'].organization.value = user.orgId

          const organizationResponse: any = await graphqlServer
            .query(
              QUERIES.getOrganizationById,
              { id: user.orgId },
              {
                persistedQuery: {
                  provider: 'vtex.b2b-organizations-graphql@0.x',
                  sender: 'vtex.storefront-permissions@1.x',
                },
              }
            )
            .catch((err) => {
              logger.error(err)
            })

          // prevent login if org is inactive
          if (
            organizationResponse?.data?.getOrganizationById?.status ===
            'inactive'
          ) {
            throw new ForbiddenError('Organization is inactive')
          }

          if (
            organizationResponse?.data?.getOrganizationById?.priceTables?.length
          ) {
            res[
              'storefront-permissions'
            ].priceTables.value = `${organizationResponse.data.getOrganizationById.priceTables.join(
              ';'
            )}`
          }

          if (
            organizationResponse?.data?.getOrganizationById?.collections?.length
          ) {
            const collections =
              organizationResponse.data.getOrganizationById.collections.map(
                (collection: any) => `productClusterIds=${collection.id}`
              )

            res.public.facets.value = `${collections.join(';')}`
          }

          if (orderFormId) {
            await checkout
              .updateOrderFormMarketingData(orderFormId, {
                attachmentId: 'marketingData',
                utmCampaign: user?.orgId,
                utmMedium: user?.costId,
              })
              .catch((err) => {
                logger.error(err)
              })
          }

          if (user?.costId) {
            res['storefront-permissions'].costcenter.value = user.costId
            const costCenterResponse: any = await graphqlServer.query(
              QUERIES.getCostCenterById,
              { id: user.costId },
              {
                persistedQuery: {
                  provider: 'vtex.b2b-organizations-graphql@0.x',
                  sender: 'vtex.storefront-permissions@1.x',
                },
              }
            )

            if (
              costCenterResponse?.data?.getCostCenterById?.addresses?.length &&
              orderFormId
            ) {
              const [address] =
                costCenterResponse.data.getCostCenterById.addresses

              await checkout
                .updateOrderFormShipping(orderFormId, { address })
                .catch((err) => {
                  logger.error(err)
                })
            }
          }
        }
      }

      ctx.response.body = res

      ctx.response.status = 200
    },
  },
  Mutation: {
    deleteRole,
    saveRole,
    deleteUser,
    saveUser,
    impersonateUser,
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
