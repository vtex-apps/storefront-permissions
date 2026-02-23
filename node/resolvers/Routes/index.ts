import { ForbiddenError } from '@vtex/api'
import { json } from 'co-body'

import { getCachedAppSettings } from '../../services/appSettingsCache'
import { getRole } from '../Queries/Roles'
import { getSessionWatcher } from '../Queries/Settings'
import {
  getActiveUserByEmail,
  getUserByEmail,
  getB2BUserById,
} from '../Queries/Users'
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
        costCenterAddressId: {
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

    if (!isWatchActive) {
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    const promises = [] as Array<Promise<any>>
    const body: any = await json(req)

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

        if (!userId) {
          userId = await profileSystem.createRegisterOnProfileSystem(
            email,
            user.name
          )
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
    }

    response['storefront-permissions'].userId.value = user?.id

    if (!user?.orgId || !user?.costId) {
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    response['storefront-permissions'].organization.value = user.orgId

    const getOrganization = async (orgId: any): Promise<any> => {
      return masterDataExtended
        .getDocumentById('organizations', orgId, [
          'name',
          'tradeName',
          'status',
          'priceTables',
          'salesChannel',
          'collections',
          'sellers',
        ])
        .catch((error) => {
          logger.error({
            error,
            message: 'setProfile.graphqlGetOrganizationById',
          })
        })
    }

    const hash = toHash(`${user.orgId}|${user.costId}`)
    const hashChanged = body?.['storefront-permissions']?.hash?.value !== hash

    response['storefront-permissions'].hash.value = hash

    const [
      organizationResponse,
      costCenterResponse,
      salesChannels,
      marketingTagsResponse,
      b2bSettingsResponse,
      appSettings,
    ] = await Promise.all([
      getOrganization(user.orgId),
      organizations.getCostCenterById(user.costId),
      salesChannelClient.getSalesChannel(),
      organizations.getMarketingTags(user.costId),
      organizations.getB2BSettings(),
      getCachedAppSettings(ctx),
    ])

    // in case the cost center is not found, we need to find a valid cost center for the user
    if (
      Object.values(
        costCenterResponse.data?.getCostCenterById ?? {}
      ).every((value) => value === null)
    ) {
      try {
        const usersByEmail = await organizations.getOrganizationsByEmail(email)

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

    let organization: any = organizationResponse

    // prevent login if org is inactive
    if (organization.status === 'inactive') {
      // try to find a valid organization
      const organizationsByUserResponse: any = await organizations
        .getOrganizationsByEmail(email)
        .catch((error) => {
          logger.error({
            error,
            message: 'setProfile.graphqlGetOrganizationById',
          })
        })

      const organizationsByUser =
        organizationsByUserResponse?.data?.getOrganizationsByEmail

      if (organizationsByUser?.length) {
        const organizationList = organizationsByUser.find(
          (org: any) => org.organizationStatus !== 'inactive'
        )

        if (organizationList) {
          organization = await getOrganization(organizationList.id)
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
      const userWithPriceTable = (await getB2BUserById(
        null,
        { id: user.id },
        ctx
      )) as { selectedPriceTable: string }

      const selectedPriceTable = userWithPriceTable?.selectedPriceTable
        ? userWithPriceTable.selectedPriceTable
        : organization.priceTables.join(',')

      response[
        'storefront-permissions'
      ].priceTables.value = `${selectedPriceTable}`
    }

    let facets = [] as any

    if (organization.collections?.length) {
      const collections = organization.collections.map(
        (collection: any) => `productClusterIds=${collection.id}`
      )

      facets = [...facets, ...collections]
    }

    const orgSellers = organization.sellers
    const costCenterSellers = costCenterResponse?.data?.getCostCenterById?.sellers
    const sellersArray = Array.isArray(costCenterSellers)
      ? costCenterSellers
      : Array.isArray(orgSellers)
        ? orgSellers
        : []

    if (sellersArray.length > 0) {
      const sellersList = sellersArray

      const { disableSellersNameFacets, disablePrivateSellersFacets } =
        await Routes.appSettings(ctx)

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
    const costCenterData = costCenterResponse?.data?.getCostCenterById
    phoneNumber = costCenterData?.phoneNumber

    businessDocument =
      costCenterData?.businessDocument?.replace(/[^a-zA-Z0-9]*/g, '') ?? null

    stateRegistration = costCenterData?.stateRegistration ?? null

    const costCenterAddresses =
      (costCenterData as { addresses?: any[] } | undefined)?.addresses ?? []
    const enableCostCenterAddressSelection =
      (appSettings as any)?.enableCostCenterAddressSelection ?? false
    const enableRegionOverwriteFlag =
      (appSettings as any)?.enableRegionOverwrite ?? false
    const publicCostCenterAddressId =
      body?.public?.costCenterAddressId?.value
    const requestedAddressId = enableCostCenterAddressSelection
      ? publicCostCenterAddressId
      : undefined
    const explicitlyClearedCostCenterAddress =
      enableCostCenterAddressSelection &&
      (publicCostCenterAddressId === '' || publicCostCenterAddressId === null)
    const allowRegionOverwrite =
      enableRegionOverwriteFlag && !!body?.public?.allowRegionOverwrite?.value
    const hasPublicPostalCode = !!body?.public?.postalCode?.value
    const hasPublicCountry = !!body?.public?.country?.value
    const usePublicPostalCodeForRegion =
      allowRegionOverwrite && hasPublicPostalCode && hasPublicCountry

    let selectedAddress: any = null
    if (costCenterAddresses.length) {
      if (requestedAddressId) {
        selectedAddress = costCenterAddresses.find(
          (addr: { addressId: string }) => addr.addressId === requestedAddressId
        )
        if (!selectedAddress) {
          logger.warn({
            message: 'setProfile.costCenterAddressIdNotFound',
            costCenterAddressId: requestedAddressId,
            costId: user.costId,
          })
          selectedAddress = costCenterAddresses[0]
        }
      } else {
        selectedAddress = costCenterAddresses[0]
      }
      response['storefront-permissions'].costCenterAddressId.value =
        explicitlyClearedCostCenterAddress ? '' : (selectedAddress?.addressId ?? '')
    }

    // Only require CPF if selected (or any) cost center address is in Brazil
    if (
      selectedAddress
        ? selectedAddress.country === 'BRA'
        : costCenterAddresses.some(
            (address: { country: string }) => address.country === 'BRA'
          )
    ) {
      documentType = Routes.PROFILE_DOCUMENT_TYPE
    }

    let { salesChannel } = organization

    const salesChannelsData =
      (salesChannels as unknown as { data?: any[] })?.data ?? []
    const validChannels = salesChannelsData.filter(
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

    if (salesChannel) {
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
      response.public.sc.value = salesChannel.toString()
    }

    if (hashChanged && orderFormId) {
      try {
        const b2bSettings = (b2bSettingsResponse as any)?.data?.getB2BSettings
        const {
          uiSettings: { clearCart },
        } = b2bSettings ?? { uiSettings: { clearCart: null } }

        if (clearCart) {
          await Promise.all(salesChannelPromise)
          await checkout.clearCart(orderFormId)
        }
      } catch (error) {
        logger.error({
          error,
          message: 'setProfile.clearCart',
        })
      }
    }

    // When usePublicPostalCodeForRegion (overwrite on + public.postalCode and public.country set): we do not set public.regionId and we set it to empty;
    // checkout-session will use public.postalCode and public.country for checkout.regionId. We also do not update the cart with an address.
    if (selectedAddress && orderFormId) {
      const address = selectedAddress
      const marketingTags: any =
        (marketingTagsResponse as any)?.data?.getMarketingTags?.tags

      if (!usePublicPostalCodeForRegion) {
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
      } else {
        response.public.regionId = { value: '' }
        logger.info({
          message: 'setProfile.regionIdSkipped',
          reason: 'usePublicPostalCodeForRegion',
          publicPostalCode: body?.public?.postalCode?.value ?? null,
        })
      }

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

      if (!usePublicPostalCodeForRegion) {
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
      } else {
        logger.info({
          message: 'setProfile.cartShippingSkipped',
          reason: 'usePublicPostalCodeForRegion',
        })
      }
    }

    const clUser = await generateClUser({
      businessDocument,
      businessName,
      clId: user?.clId,
      ctx,
      phoneNumber: phoneNumber ?? null,
      stateRegistration,
      tradeName,
      isCorporate,
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

    logger.info({
      'setProfile.body': JSON.stringify(body),
      'setProfile.output': JSON.stringify(response),
    })

    ctx.response.body = response
    ctx.response.status = 200
  },
}
