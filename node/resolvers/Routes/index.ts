import { ForbiddenError } from '@vtex/api'
import { json } from 'co-body'

import { getRole } from '../Queries/Roles'
import { getSessionWatcher } from '../Queries/Settings'
import { getActiveUserByEmail, getUserByEmail } from '../Queries/Users'
import { generateClUser } from './utils'
import { getUser, setActiveUserByOrganization } from '../Mutations/Users'
import { toHash } from '../../utils'

export const Routes = {
  PROFILE_DOCUMENT_TYPE: 'cpf',
  appSettings: async (ctx: Context) => {
    const appId = process.env.VTEX_APP_ID ? process.env.VTEX_APP_ID : ''
    const { disableSellersNameFacets, disablePrivateSellersFacets } =
      await ctx.clients.apps.getAppSettings(appId)

    return { disableSellersNameFacets, disablePrivateSellersFacets }
  },
  checkPermissions: async (ctx: Context) => {
    const {
      vtex: { logger },
    } = ctx

    ctx.set('Content-Type', 'application/json')

    const params: any = await json(ctx.req)

    let response

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

        response = {
          permissions: currentModule?.features ?? [],
          role: userRole,
        }
      }
    }

    ctx.response.body = response
    ctx.response.status = 200
  },

  setProfile: async (ctx: Context) => {
    const {
      clients: {
        organizations,
        masterdata,
        masterDataExtended,
        checkout,
        profileSystem,
        salesChannel: salesChannelClient,
      },
      req,
      vtex: { logger },
    } = ctx
    // Timing utility
    const timeLog = new Map<string, number>()

    const logTime = (label: string) => {
      const now = Date.now()
      timeLog.set(label, now)
      return now
    }

    const getDuration = (label: string) => {
      const end = Date.now()
      const start = timeLog.get(label)
      return start ? end - start : 0
    }

    // Start total execution timer
    logTime('total')

    const response: any = {
      public: {
        facets: {
          value: '',
        },
        sc: {
          value: '',
        },
        regionId: {
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
        userId: {
          value: '',
        },
        hash: {
          value: '',
        },
      },
    }

    ctx.set('Content-Type', 'application/json')
    ctx.set('Cache-Control', 'no-cache, no-store')

    const isWatchActive = await getSessionWatcher(null, null, ctx)
    logTime('getSessionWatcher')
    logger.debug({
      message: 'getSessionWatcher completed',
      processingTime: getDuration('getSessionWatcher'),
    })
    if (!isWatchActive) {
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    const promises = [] as Array<Promise<any>>
    const body: any = await json(req)
    logTime('jsonParse')
    logger.debug({
      message: 'JSON parsing completed',
      processingTime: getDuration('jsonParse'),
    })

    const b2bImpersonate = body?.public?.impersonate?.value
    const telemarketingImpersonate = body?.impersonate?.storeUserId?.value
    const orderFormId = body?.checkout?.orderFormId?.value
    const isCorporate = true

    let email = body?.authentication?.storeUserEmail?.value
    let businessName = null
    let businessDocument = null
    let documentType = null
    let phoneNumber = null
    let tradeName = null
    let stateRegistration = null
    let user = null

    const ignoreB2B = body?.public?.removeB2B?.value

    if (ignoreB2B) {
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    if (email && b2bImpersonate) {
      try {
        logTime('getUser')
        user = (await getUser({
          masterdata,
          params: { userId: b2bImpersonate },
        })) as {
          orgId: string
          costId: string
          clId: string
          id: string
          email: string
          userId: string
          name: string
        }
        email = user.email
        let { userId } = user
        logger.debug({
          message: 'getUser completed',
          processingTime: getDuration('getUser'),
        })
        if (!userId) {
          logTime('createUser')
          userId = await profileSystem.createRegisterOnProfileSystem(
            email,
            user.name
          )
          logger.debug({
            message: 'createUser completed',
            processingTime: getDuration('createUser'),
          })
        }

        response['storefront-permissions'].storeUserId.value = userId
        response['storefront-permissions'].storeUserEmail.value = user.email
      } catch (error) {
        logger.error({ message: 'setProfile.getUserError', error })
      }
    } else if (telemarketingImpersonate) {
      const telemarketingEmail = body?.impersonate?.storeUserEmail?.value

      response['storefront-permissions'].storeUserId.value =
        telemarketingImpersonate
      response['storefront-permissions'].storeUserEmail.value =
        telemarketingEmail
      email = telemarketingEmail
    }

    if (!email) {
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    if (user === null) {
      logTime('getActiveUserByEmail')
      user = (await getActiveUserByEmail(null, { email }, ctx).catch(
        (error) => {
          logger.warn({ message: 'setProfile.getUserByEmailError', error })
        }
      )) as {
        orgId: string
        costId: string
        clId: string
        id: string
      }
      logger.debug({
        message: 'getActiveUserByEmail completed',
        processingTime: getDuration('getActiveUserByEmail'),
      })
    }

    response['storefront-permissions'].userId.value = user?.id

    if (!user?.orgId || !user?.costId) {
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    response['storefront-permissions'].organization.value = user.orgId

    logTime('getOrganizationById')
    const getOrganization = async (orgId: any): Promise<any> => {
      return masterDataExtended.getDocumentById(
        'organizations',
        orgId,
        [
          'name',
          'tradeName',
          'status',
          'priceTables',
          'salesChannel',
          'collections',
          'sellers'
        ],
      ).catch((error) => {
        logger.error({
          error,
          message: 'setProfile.graphqlGetOrganizationById',
        })
      })
    }

    logger.debug({
      message: 'getOrganizationById completed',
      processingTime: getDuration('getOrganizationById'),
    })

    const hash = toHash(`${user.orgId}|${user.costId}`)
    const hashChanged = body?.['storefront-permissions']?.hash?.value !== hash

    response['storefront-permissions'].hash.value = hash

    // Time the Promise.all block
    logTime('promiseAllMain')
    const [
      organizationResponse,
      costCenterResponse,
      salesChannels,
      marketingTagsResponse,
      b2bSettingsResponse,
    ]: Array<{
      data: any
    }> = await Promise.all([
      getOrganization(user.orgId),
      organizations.getCostCenterById(user.costId),
      salesChannelClient.getSalesChannel(),
      organizations.getMarketingTags(user.costId),
      organizations.getB2BSettings(),
    ])
    logger.debug({
      message: 'Main Promise.all completed',
      processingTime: getDuration('promiseAllMain'),
    })

    // in case the cost center is not found, we need to find a valid cost center for the user
    if (
      Object.values(costCenterResponse.data.getCostCenterById).every(
        (value) => value === null
      )
    ) {
      try {
        logTime('getOrganizationsByEmail')
        const usersByEmail = await organizations.getOrganizationsByEmail(email)
        logger.debug({
          message: 'getOrganizationsByEmail completed',
          processingTime: getDuration('getOrganizationsByEmail'),
        })
        // when cost center comes without a name, it's because the cost center is deleted
        const usersData = usersByEmail.data.getOrganizationsByEmail.find(
          (userByEmail) => userByEmail.costCenterName !== null
        )

        user.costId = usersData?.costId ?? user.costId
      } catch (error) {
        logger.error({
          error,
          message: 'setProfile.graphqlGetOrganizationById',
        })
      }
    }

    let organization: any = organizationResponse//?.data?.getOrganizationById

    // prevent login if org is inactive
    if (organization.status === 'inactive') {
      // try to find a valid organization
      logTime('getInactiveOrganizationsByEmail')
      const organizationsByUserResponse: any = await organizations
        .getOrganizationsByEmail(email)
        .catch((error) => {
          logger.error({
            error,
            message: 'setProfile.graphqlGetOrganizationById',
          })
        })
      logger.debug({
        message: 'getInactiveOrganizationsByEmail completed',
        processingTime: getDuration('getInactiveOrganizationsByEmail'),
      })
      const organizationsByUser =
        organizationsByUserResponse?.data?.getOrganizationsByEmail

      if (organizationsByUser?.length) {
        const organizationList = organizationsByUser.find(
          (org: any) => org.organizationStatus !== 'inactive'
        )

        if (organizationList) {
          logTime('getInactiveOrganizationsById')
          organization = await getOrganization(organizationList.id)
            logger.debug({
              message: 'getInactiveOrganizationsById completed',
              processingTime: getDuration('getInactiveOrganizationsById'),
            })

          logTime('setActiveUserByOrganization')
          await setActiveUserByOrganization(
            null,
            {
              costId: organizationList.costId,
              email,
              orgId: organizationList.orgId,
              userId: organizationList.id,
            },
            ctx
          ).catch((error) => {
            logger.warn({
              error,
              message: 'setProfile.setActiveUserByOrganizationError',
            })
          })
          logger.debug({
            message: 'setActiveUserByOrganization completed',
            processingTime: getDuration('setActiveUserByOrganization'),
          })
        }
      } else {
        logger.warn({
          message: `setProfile-organizationInactive`,
          organizationData: organization,
          organizationId: user.orgId,
        })
        throw new ForbiddenError('Organization is inactive')
      }
    }

    businessName = organization.name
    tradeName = organization.tradeName

    if (organization.priceTables?.length) {
      response[
        'storefront-permissions'
      ].priceTables.value = `${organization.priceTables.join(',')}`
    }

    let facets = [] as any

    if (organization.collections?.length) {
      const collections = organization.collections.map(
        (collection: any) => `productClusterIds=${collection.id}`
      )

      facets = [...facets, ...collections]
    }

    if (
      organization.sellers?.length ||
      costCenterResponse?.data?.getCostCenterById?.sellers?.length
    ) {
      const sellersList =
        costCenterResponse?.data?.getCostCenterById?.sellers ??
        organization.sellers

      logTime('getAppSettings')
      const { disableSellersNameFacets, disablePrivateSellersFacets } =
        await Routes.appSettings(ctx)
      logger.debug({
        message: 'getAppSettings completed',
        processingTime: getDuration('getAppSettings'),
      })

      if (!disableSellersNameFacets) {
        const sellersName = sellersList.map(
          (seller: any) =>
            `sellername=${seller.name
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')}`
        )

        facets = [...facets, ...sellersName]
      }

      if (!disablePrivateSellersFacets) {
        const sellersId = sellersList.map(
          (seller: any) => `private-seller=${seller.id}`
        )

        facets = [...facets, ...sellersId]
      }
    }

    response.public.facets.value = facets ? `${facets.join(';')};` : null

    response['storefront-permissions'].costcenter.value = user.costId
    phoneNumber = costCenterResponse?.data?.getCostCenterById?.phoneNumber

    businessDocument =
      costCenterResponse.data.getCostCenterById.businessDocument?.replace(
        /[^a-zA-Z0-9]*/,
        ''
      )

    stateRegistration =
      costCenterResponse.data.getCostCenterById.stateRegistration

    // Only require CPF if cost center contains an address in Brazil
    // This is a workaround to avoid setting CPF as documentType for countries other than Brazil
    if (
      costCenterResponse?.data?.getCostCenterById?.addresses?.some(
        (address: { country: string }) => address.country === 'BRA'
      )
    ) {
      documentType = Routes.PROFILE_DOCUMENT_TYPE
    }

    let { salesChannel } = organization

    const validChannels = salesChannels.data.filter(
      (channel: any) => channel.IsActive
    )

    if (
      !salesChannel?.length ||
      !validChannels?.find(
        (validSalesChannel: any) =>
          String(validSalesChannel.Id) === salesChannel.toString()
      )
    ) {
      if (validChannels.length) {
        salesChannel = validChannels[0].Id
      }
    }

    const salesChannelPromise = []

    logTime('updateSalesChannelStart') // Mark the start of this block
    if (salesChannel) {
      logTime('updateSalesChannelPromise') // Before creating the promise
      salesChannelPromise.push(
        checkout
          .updateSalesChannel(orderFormId, salesChannel)
          .catch((error) => {
            logger.error({
              error,
              message: 'setProfile.updateSalesChannel',
            })
          })
      )
      logger.debug({
        message: 'updateSalesChannel promise created',
        processingTime: getDuration('updateSalesChannelPromise'),
      })
      response.public.sc.value = salesChannel.toString()
    }

    logTime('clearCartCheckStart') // Before the clearCart conditional block
    if (hashChanged && orderFormId) {
      try {
        logTime('b2bSettingsAccess') // Accessing B2B settings
        const {
          uiSettings: { clearCart },
        } = b2bSettingsResponse?.data?.getB2BSettings ?? {
          uiSettings: { clearCart: null },
        }
        logger.debug({
          message: 'B2B settings accessed',
          processingTime: getDuration('b2bSettingsAccess'),
        })

        if (clearCart) {
          logTime('awaitSalesChannel') // Before awaiting the sales channel promise
          await Promise.all(salesChannelPromise)
          logger.debug({
            message: 'salesChannelPromise resolved',
            processingTime: getDuration('awaitSalesChannel'),
          })

          logTime('clearCart') // Before clearing the cart
          await checkout.clearCart(orderFormId)
          logger.debug({
            message: 'clearCart completed',
            processingTime: getDuration('clearCart'),
          })
        }
      } catch (error) {
        logger.error({
          error,
          message: 'setProfile.clearCart',
        })
      }
    }
    logger.debug({
      message: 'updateSalesChannel block completed',
      processingTime: getDuration('updateSalesChannelStart'), // Duration of entire block
    })


    if (
      costCenterResponse?.data?.getCostCenterById?.addresses?.length &&
      orderFormId
    ) {
      const [address] = costCenterResponse.data.getCostCenterById.addresses

      const marketingTags: any =
        marketingTagsResponse?.data?.getMarketingTags?.tags
      logTime('getRegionId')
      try {
        const [regionId] = await checkout.getRegionId(
          address.country,
          address.postalCode,
          salesChannel.toString(),
          address.geoCoordinates
        )

        if (regionId?.id) {
          response.public.regionId = {
            value: regionId.id,
          }
        }
      } catch (error) {
        logger.error({
          error,
          message: 'setProfile.getRegionId',
        })
      }
      logger.debug({
        message: 'getRegionId completed',
        processingTime: getDuration('getRegionId'),
      })

      logTime('updateOrderFormMarketingDataShippingClientProfile')
      promises.push(
        checkout
          .updateOrderFormMarketingData(orderFormId, {
            attachmentId: 'marketingData',
            marketingTags: marketingTags || [],
            utmCampaign: user.orgId,
            utmMedium: user.costId,
          })
          .catch((error) => {
            logger.error({
              error,
              message: 'setProfile.updateOrderFormMarketingDataError',
            })
          })
      )

      promises.push(
        checkout
          .updateOrderFormShipping(orderFormId, {
            address: {
              ...address,
              geoCoordinates: address.geoCoordinates ?? [],
              isDisposable: true,
            },
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

    logTime('generateClUser')
    const clUser = await generateClUser({
      businessDocument,
      businessName,
      clId: user?.clId,
      ctx,
      phoneNumber,
      stateRegistration,
      tradeName,
      isCorporate,
    })
    logger.debug({
      message: 'generateClUser completed',
      processingTime: getDuration('generateClUser'),
    })
    if (clUser && orderFormId) {
      const phoneNumberFormatted =
        phoneNumber || clUser.phone || clUser.homePhone || `+1${'0'.repeat(10)}`

      promises.push(
        checkout
          .updateOrderFormProfile(orderFormId, {
            ...clUser,
            businessDocument: businessDocument || clUser.businessDocument,
            documentType: documentType ?? undefined,
            phone: phoneNumberFormatted,
            stateInscription:
              stateRegistration || clUser.stateInscription || '0'.repeat(9),
          })
          .catch((error) => {
            logger.error({
              error,
              message: 'setProfile.updateOrderFormProfileError',
            })
          })
      )
    }

    // Don't await promises, to avoid session timeout
    Promise.all(promises)

    logger.debug({
      message: 'updateOrderFormMarketingDataShippingClientProfile completed',
      processingTime: getDuration('updateOrderFormMarketingDataShippingClientProfile'),
    })

    logger.info({
      'setProfile.body': JSON.stringify(body),
      'setProfile.output': JSON.stringify(response),
    })


    // Log total execution time
    const totalTime = getDuration('total')
    logger.debug({
      message: 'setProfile total execution',
      processingTime: totalTime,
      breakdown: (() => {
        const obj: { [key: string]: number } = {}
        timeLog.forEach((value, key) => {
          obj[key] = value
        })
        return obj
      })(),
    })
    ctx.response.body = response
    ctx.response.status = 200
  },
}
