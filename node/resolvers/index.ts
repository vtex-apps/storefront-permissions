/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { json } from 'co-body'
import { ForbiddenError } from '@vtex/api'

import { deleteRole, saveRole } from './Mutations/Roles'
import { getRole, listRoles, hasUsers } from './Queries/Roles'
import { deleteUser, saveUser, impersonateUser } from './Mutations/Users'
import { sessionWatcher } from './Mutations/Settings'
import { getFeaturesByModule, listFeatures } from './Queries/Features'
import { getAppSettings, getSessionWatcher } from './Queries/Settings'
import {
  getUser,
  getUserByEmail,
  listUsers,
  checkUserPermission,
  checkImpersonation,
  getUserById,
} from './Queries/Users'

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
      const {
        clients: { graphqlServer, checkout, profileSystem },
        req,
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

      ctx.set('Content-Type', 'application/json')
      ctx.set('Cache-Control', 'no-cache, no-store')

      const isWatchActive = await getSessionWatcher(null, null, ctx)

      if (isWatchActive) {
        const body: any = await json(req)

        let impersonate = body?.public?.impersonate?.value ?? null
        let email = body?.authentication?.storeUserEmail?.value ?? null
        const orderFormId = body?.checkout?.orderFormId?.value ?? null

        const orderFormData = await checkout.orderForm(orderFormId)

        if (
          orderFormData?.userProfileId &&
          orderFormData?.userType === 'callCenterOperator' &&
          orderFormData?.clientProfileData?.email !== email
        ) {
          impersonate = orderFormData.userProfileId
        }

        if (impersonate) {
          const profile: any = await profileSystem
            .getProfileInfo(impersonate)
            .catch((error) => {
              logger.error({ message: 'setProfile.getProfileInfoError', error })
            })

          if (profile) {
            res['storefront-permissions'].storeUserId.value = profile.userId
            res['storefront-permissions'].storeUserEmail.value = profile.email
            email = profile.email
          }
        }

        if (email) {
          const [user]: any = await getUserByEmail(null, { email }, ctx).catch(
            (error) => {
              logger.warn({ message: 'setProfile.getUserByEmailError', error })
            }
          )

          if (user?.clId) {
            const clUser = await getUserById(
              null,
              { id: user.clId },
              ctx
            ).catch((error) => {
              logger.error({ message: 'setProfile.getUserByIdError', error })
            })

            if (clUser && orderFormId) {
              if (clUser.isCorporate === null) clUser.isCorporate = false
              await checkout
                .updateOrderFormProfile(orderFormId, clUser)
                .catch((error) => {
                  logger.error({
                    message: 'setProfile.updateOrderFormProfileError',
                    error,
                  })
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
              .catch((error) => {
                logger.error({
                  message: 'setProfile.graphqlGetOrganizationById',
                  error,
                })
              })

            // prevent login if org is inactive
            if (
              organizationResponse?.data?.getOrganizationById?.status ===
              'inactive'
            ) {
              throw new ForbiddenError('Organization is inactive')
            }

            if (
              organizationResponse?.data?.getOrganizationById?.priceTables
                ?.length
            ) {
              res[
                'storefront-permissions'
              ].priceTables.value = `${organizationResponse.data.getOrganizationById.priceTables.join(
                ';'
              )}`
            }

            if (
              organizationResponse?.data?.getOrganizationById?.collections
                ?.length
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
                .catch((error) => {
                  logger.error({
                    message: 'setProfile.updateOrderFormMarketingDataError',
                    error,
                  })
                })
            }

            if (user?.costId) {
              res['storefront-permissions'].costcenter.value = user.costId
              const costCenterResponse: any = await graphqlServer
                .query(
                  QUERIES.getCostCenterById,
                  { id: user.costId },
                  {
                    persistedQuery: {
                      provider: 'vtex.b2b-organizations-graphql@0.x',
                      sender: 'vtex.storefront-permissions@1.x',
                    },
                  }
                )
                .catch((error) => {
                  logger.error({
                    message: 'setProfile.graphqlGetCostCenterById',
                    error,
                  })
                })

              if (
                costCenterResponse?.data?.getCostCenterById?.addresses
                  ?.length &&
                orderFormId
              ) {
                const [address] =
                  costCenterResponse.data.getCostCenterById.addresses

                await checkout
                  .updateOrderFormShipping(orderFormId, {
                    address,
                    clearAddressIfPostalCodeNotFound: false,
                  })
                  .catch((error) => {
                    logger.error({
                      message: 'setProfile.updateOrderFormShippingError',
                      error,
                    })
                  })
              }
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
    sessionWatcher,
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
    checkImpersonation,
    getAppSettings,
    getSessionWatcher,
  },
}
