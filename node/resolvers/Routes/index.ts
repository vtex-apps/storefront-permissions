import { ForbiddenError } from '@vtex/api'
import { json } from 'co-body'

import { getRole } from '../Queries/Roles'
import { getAppSettings, getSessionWatcher } from '../Queries/Settings'
import { getUserByEmail, getUserById } from '../Queries/Users'

const QUERIES = {
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
      businessDocument
    }
  }`,
  getOrganizationById: `query Organization($id: ID!){
    getOrganizationById(id: $id) @context(provider: "vtex.b2b-organizations-graphql"){
      name
      status
      priceTables
      collections {
        id
      }
    }
  }`,
}

export const Routes = {
  checkPermissions: async (ctx: Context) => {
    const {
      vtex: { logger },
    } = ctx

    ctx.set('Content-Type', 'application/json')
    await getAppSettings(null, null, ctx)

    const params: any = await json(ctx.req)

    let ret

    if (!params?.app) {
      logger.warn({
        message: `checkPermissions-appNotDefined`,
        params,
      })
      throw new Error('App not defined')
    }

    if (!params?.email) {
      logger.warn({
        message: `checkPermissions-emailNotDefined`,
        params,
      })
      throw new Error('Email not defined')
    }

    const userData: any = await getUserByEmail(
      null,
      { email: params.email },
      ctx
    )

    if (!userData.length) {
      logger.warn({
        email: params.email,
        message: `checkPermissions-userNotFound`,
      })
      throw new Error('User not found')
    }

    if (userData.length) {
      const userRole: any = await getRole(null, { id: userData[0].roleId }, ctx)

      if (!userRole) {
        logger.warn({
          message: `checkPermissions-roleNotFound`,
          roleId: userData[0].roleId,
        })
        throw new Error('Role not found')
      }

      if (userRole) {
        const currentModule = userRole.features.find((feature: any) => {
          return feature.module === params.app
        })

        ret = {
          permissions: currentModule?.features ?? [],
          role: userRole,
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
      public: {
        facets: {
          value: '',
        },
      },
      'storefront-permissions': {
        costcenter: {
          value: '',
        },
        organization: {
          value: '',
        },
        priceTables: {
          value: '',
        },
        storeUserEmail: {
          value: '',
        },
        storeUserId: {
          value: '',
        },
      },
    }

    ctx.set('Content-Type', 'application/json')
    ctx.set('Cache-Control', 'no-cache, no-store')

    const isWatchActive = await getSessionWatcher(null, null, ctx)

    if (isWatchActive) {
      const promises = [] as Array<Promise<any>>
      const body: any = await json(req)

      const b2bImpersonate = body?.public?.impersonate?.value ?? null

      const telemarketingImpersonate =
        body?.impersonate?.storeUserId?.value ?? null

      let email = body?.authentication?.storeUserEmail?.value ?? null
      const orderFormId = body?.checkout?.orderFormId?.value ?? null
      let businessName = null
      let businessDocument = null

      if (b2bImpersonate) {
        const profile: any = await profileSystem
          .getProfileInfo(b2bImpersonate)
          .catch((error) => {
            logger.error({ message: 'setProfile.getProfileInfoError', error })
          })

        if (profile) {
          res['storefront-permissions'].storeUserId.value = profile.userId
          res['storefront-permissions'].storeUserEmail.value = profile.email
          email = profile.email
        }
      } else if (telemarketingImpersonate) {
        const telemarketingEmail =
          body?.impersonate?.storeUserEmail?.value ?? null

        res['storefront-permissions'].storeUserId.value =
          telemarketingImpersonate
        res['storefront-permissions'].storeUserEmail.value = telemarketingEmail
        email = telemarketingEmail
      }

      if (email) {
        const [user]: any = await getUserByEmail(null, { email }, ctx).catch(
          (error) => {
            logger.warn({ message: 'setProfile.getUserByEmailError', error })
          }
        )

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
                error,
                message: 'setProfile.graphqlGetOrganizationById',
              })
            })

          // prevent login if org is inactive
          if (
            organizationResponse?.data?.getOrganizationById?.status ===
            'inactive'
          ) {
            logger.warn({
              message: `setProfile-organizationInactive`,
              organizationData: organizationResponse?.data?.getOrganizationById,
              organizationId: user.orgId,
            })
            throw new ForbiddenError('Organization is inactive')
          }

          if (organizationResponse?.data?.getOrganizationById?.name) {
            businessName = organizationResponse?.data?.getOrganizationById?.name
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
            promises.push(
              checkout
                .updateOrderFormMarketingData(orderFormId, {
                  attachmentId: 'marketingData',
                  utmCampaign: user?.orgId,
                  utmMedium: user?.costId,
                })
                .catch((error) => {
                  logger.error({
                    error,
                    message: 'setProfile.updateOrderFormMarketingDataError',
                  })
                })
            )
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
                  error,
                  message: 'setProfile.graphqlGetCostCenterById',
                })
              })

            if (costCenterResponse?.data?.getCostCenterById?.businessDocument) {
              businessDocument =
                costCenterResponse.data.getCostCenterById.businessDocument
            }

            if (
              costCenterResponse?.data?.getCostCenterById?.addresses?.length &&
              orderFormId
            ) {
              const [address] =
                costCenterResponse.data.getCostCenterById.addresses

              promises.push(
                checkout
                  .updateOrderFormShipping(orderFormId, {
                    address,
                    clearAddressIfPostalCodeNotFound: false,
                  })
                  .catch((error) => {
                    logger.error({
                      error,
                      message: 'setProfile.updateOrderFormShippingError',
                    })
                  })
              )
            }
          }

          if (user?.clId) {
            const clUser = await getUserById(
              null,
              { id: user.clId },
              ctx
            ).catch((error) => {
              logger.error({ message: 'setProfile.getUserByIdError', error })
            })

            if (clUser && orderFormId) {
              if (clUser.isCorporate === null) {
                clUser.isCorporate = false
              }

              if (businessName && businessDocument) {
                clUser.isCorporate = true
                clUser.corporateName = businessName
                clUser.corporateDocument = businessDocument
              }

              promises.push(
                checkout
                  .updateOrderFormProfile(orderFormId, clUser)
                  .catch((error) => {
                    logger.error({
                      error,
                      message: 'setProfile.updateOrderFormProfileError',
                    })
                  })
              )
            }
          }
        }
      }

      // Don't await promises, to avoid session timeout
      Promise.all(promises).catch((error) => {
        logger.error({
          error,
          message: 'setProfile.updateOrderFormProfileError',
        })
      })
    }

    ctx.response.body = res
    ctx.response.status = 200
  },
}
