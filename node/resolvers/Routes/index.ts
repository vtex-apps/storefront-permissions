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
    const appId = process.env.VTEX_APP_ID || ''
    const { disableSellersNameFacets, disablePrivateSellersFacets } =
      await ctx.clients.apps.getAppSettings(appId)
    return { disableSellersNameFacets, disablePrivateSellersFacets }
  },
  checkPermissions: async (ctx: Context) => {
    const { vtex: { logger } } = ctx
    ctx.set('Content-Type', 'application/json')
    const params: any = await json(ctx.req)

    if (!params?.app) {
      logger.warn({ message: 'checkPermissions-appNotDefined', params })
      throw new Error('App not defined')
    }
    if (!params?.email) {
      logger.warn({ message: 'checkPermissions-emailNotDefined', params })
      throw new Error('Email not defined')
    }

    const userData: any = await getUserByEmail(null, { email: params.email }, ctx)
    if (!userData.length) {
      logger.warn({ email: params.email, message: 'checkPermissions-userNotFound' })
      throw new Error('User not found')
    }

    const userRole: any = await getRole(null, { id: userData[0].roleId }, ctx)
    if (!userRole) {
      logger.warn({ message: 'checkPermissions-roleNotFound', roleId: userData[0].roleId })
      throw new Error('Role not found')
    }

    const currentModule = userRole.features.find((feature: any) => feature.module === params.app)
    ctx.response.body = {
      permissions: currentModule?.features ?? [],
      role: userRole,
    }
    ctx.response.status = 200
  },

  setProfile: async (ctx: Context) => {
    const {
      clients: {
        organizations,
        masterdata,
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
      timeLog.set(label, Date.now())
      return Date.now()
    }
    const getDuration = (label: string) => {
      const end = Date.now()
      const start = timeLog.get(label)
      return start ? end - start : 0
    }
    logTime('total')

    const response: any = {
      public: { facets: { value: '' }, sc: { value: '' }, regionId: { value: '' } },
      'storefront-permissions': {
        costcenter: { value: '' }, organization: { value: '' }, priceTables: { value: '' },
        storeUserEmail: { value: '' }, storeUserId: { value: '' }, userId: { value: '' },
        hash: { value: '' },
      },
    }

    ctx.set('Content-Type', 'application/json')
    ctx.set('Cache-Control', 'no-cache, no-store')

    logTime('getSessionWatcher')
    const isWatchActive = await getSessionWatcher(null, null, ctx)
    logger.debug({ message: 'getSessionWatcher completed', processingTime: getDuration('getSessionWatcher') })

    if (!isWatchActive) {
      ctx.response.body = response
      ctx.response.status = 200
      return
    }

    const body: any = await json(req)

    const b2bImpersonate = body?.public?.impersonate?.value
    const telemarketingImpersonate = body?.impersonate?.storeUserId?.value
    const orderFormId = body?.checkout?.orderFormId?.value
    const ignoreB2B = body?.public?.removeB2B?.value
    let email = body?.authentication?.storeUserEmail?.value
    let user = null

    if (ignoreB2B) {
      ctx.response.body = response
      ctx.response.status = 200
      return
    }

    if (email && b2bImpersonate) {
      logTime('getUser')
      user = await getUser({ masterdata, params: { userId: b2bImpersonate } }).catch(error => {
        logger.error({ message: 'setProfile.getUserError', error })
        return null
      }) as { orgId: string, costId: string, clId: string, id: string, email: string, userId: string, name: string } | null
      logger.debug({ message: 'getUser completed', processingTime: getDuration('getUser') })
      if (user) {
        email = user.email
        let { userId } = user
        if (!userId) {
          logTime('createUser')
          userId = await profileSystem.createRegisterOnProfileSystem(email, user.name)
          logger.debug({ message: 'createUser completed', processingTime: getDuration('createUser') })
        }
        response['storefront-permissions'].storeUserId.value = userId
        response['storefront-permissions'].storeUserEmail.value = user.email
      }
    } else if (telemarketingImpersonate) {
      const telemarketingEmail = body?.impersonate?.storeUserEmail?.value
      response['storefront-permissions'].storeUserId.value = telemarketingImpersonate
      response['storefront-permissions'].storeUserEmail.value = telemarketingEmail
      email = telemarketingEmail
    }

    if (!email) {
      ctx.response.body = response
      ctx.response.status = 200
      return
    }

    if (!user) {
      logTime('getActiveUserByEmail')
      user = await getActiveUserByEmail(null, { email }, ctx).catch(error => {
        logger.warn({ message: 'setProfile.getUserByEmailError', error })
        return null
      }) as { orgId: string, costId: string, clId: string, id: string } | null
      logger.debug({ message: 'getActiveUserByEmail completed', processingTime: getDuration('getActiveUserByEmail') })
    }

    if (!user?.orgId || !user?.costId) {
      ctx.response.body = response
      ctx.response.status = 200
      return
    }

    response['storefront-permissions'].userId.value = user?.id
    response['storefront-permissions'].organization.value = user.orgId

    logTime('getOrganization')
    const getOrganization = async (orgId: string): Promise<any> => {
      return organizations.getOrganizationById(orgId).catch(error => {
        logger.error({ error, message: 'setProfile.graphqlGetOrganizationById' })
        return null
      })
    }
    logger.debug({
      message: 'getOrganization completed',
      processingTime: getDuration('getOrganization'),
    })

    const hash = toHash(`${user.orgId}|${user.costId}`)
    const hashChanged = body?.['storefront-permissions']?.hash?.value !== hash
    response['storefront-permissions'].hash.value = hash

    logTime('promiseAllMain')
    const [
      organizationResponse,
      costCenterResponse,
      salesChannels,
      marketingTagsResponse,
      b2bSettingsResponse,
    ]: Array<{ data: any }> = await Promise.all([
      getOrganization(user.orgId),
      organizations.getCostCenterById(user.costId),
      salesChannelClient.getSalesChannel(),
      organizations.getMarketingTags(user.costId),
      organizations.getB2BSettings(),
    ])
    // TODO: Check opportunity to use a single call for all these queries
    logger.debug({ message: 'Main Promise.all completed', processingTime: getDuration('promiseAllMain') })

    // Optimize cost center check
    const costCenterData = costCenterResponse.data.getCostCenterById
    if (!costCenterData?.name) {
      logTime('getOrganizationsByEmail')
      const usersByEmail = await organizations.getOrganizationsByEmail(email).catch(error => {
        logger.error({ error, message: 'setProfile.graphqlGetOrganizationById' })
        return { data: { getOrganizationsByEmail: [] } }
      })
      logger.debug({ message: 'getOrganizationsByEmail completed', processingTime: getDuration('getOrganizationsByEmail') })
      const validUserData = usersByEmail.data.getOrganizationsByEmail.find(user => user.costCenterName)
      user.costId = validUserData?.costId ?? user.costId
    }

    logTime('orgProcessingStart')
    let organization = organizationResponse?.data?.getOrganizationById
    // TODO: Transport this logic to a trigger to update users once the organization is disabled
    if (organization?.status === 'inactive') {
      logTime('getInactiveOrganizationsByEmail')
      const organizationsByUserResponse = await organizations.getOrganizationsByEmail(email).catch(error => {
        logger.error({ error, message: 'setProfile.graphqlGetOrganizationById' })
        return { data: { getOrganizationsByEmail: [] } }
      })
      logger.debug({ message: 'getInactiveOrganizationsByEmail completed', processingTime: getDuration('getInactiveOrganizationsByEmail') })

      const activeOrg = organizationsByUserResponse.data.getOrganizationsByEmail.find(org => org.organizationStatus !== 'inactive')
      if (activeOrg) {
        logTime('getInactiveOrganizationsById')
        organization = (await getOrganization(activeOrg.id))?.data?.getOrganizationById
        logger.debug({ message: 'getInactiveOrganizationsById completed', processingTime: getDuration('getInactiveOrganizationsById') })

        logTime('setActiveUserByOrganization')
        await setActiveUserByOrganization(null, { costId: activeOrg.costId, email, orgId: activeOrg.orgId, userId: activeOrg.id }, ctx)
          .catch(error => logger.warn({ error, message: 'setProfile.setActiveUserByOrganizationError' }))
        logger.debug({ message: 'setActiveUserByOrganization completed', processingTime: getDuration('setActiveUserByOrganization') })
      } else {
        logger.warn({ message: 'setProfile-organizationInactive', organizationData: organization, organizationId: user.orgId })
        throw new ForbiddenError('Organization is inactive')
      }
    }
    logger.debug({ message: 'organization processing completed', processingTime: getDuration('orgProcessingStart') })

    // Pre-compute values to avoid repeated access
    const priceTables = organization.priceTables?.join(',') || ''
    response['storefront-permissions'].priceTables.value = priceTables

    logTime('facetsCalculationStart')
    const facets = []
    if (organization.collections?.length) {
      facets.push(...organization.collections.map((collection: any) => `productClusterIds=${collection.id}`))
    }

    const sellersList = costCenterData.sellers?.length ? costCenterData.sellers : organization.sellers
    if (sellersList?.length) {
      logTime('getAppSettings')
      const { disableSellersNameFacets, disablePrivateSellersFacets } = await Routes.appSettings(ctx)
      logger.debug({ message: 'getAppSettings completed', processingTime: getDuration('getAppSettings') })

      if (!disableSellersNameFacets) {
        facets.push(...sellersList.map((seller: any) => `sellername=${seller.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`))
      }
      if (!disablePrivateSellersFacets) {
        facets.push(...sellersList.map((seller: any) => `private-seller=${seller.id}`))
      }
    }
    response.public.facets.value = facets.length ? `${facets.join(';')};` : null
    logger.debug({ message: 'facets calculation completed', processingTime: getDuration('facetsCalculationStart') })

    response['storefront-permissions'].costcenter.value = user.costId
    const costCenterAddresses = costCenterData.addresses || []
    const hasBrazilAddress = costCenterAddresses.some((addr: any) => addr.country === 'BRA')

    let salesChannel = organization.salesChannel
    const validChannels = salesChannels.data.filter((channel: any) => channel.IsActive)
    if (!salesChannel || !validChannels.some((ch: any) => String(ch.Id) === salesChannel.toString())) {
      salesChannel = validChannels[0]?.Id
    }

    logTime('clearCartCheckStart')
    if (hashChanged && orderFormId) {
      logTime('b2bSettingsAccess')
      const clearCart = b2bSettingsResponse?.data?.getB2BSettings?.uiSettings?.clearCart ?? false
      logger.debug({ message: 'B2B settings accessed', processingTime: getDuration('b2bSettingsAccess') })

      if (clearCart) {
        logTime('awaitSalesChannel')
        logger.debug({ message: 'salesChannelPromise resolved', processingTime: getDuration('awaitSalesChannel') })

        logTime('clearCart')
        await checkout.clearCart(orderFormId).catch(error => logger.error({ error, message: 'setProfile.clearCart' }))
        logger.debug({ message: 'clearCart completed', processingTime: getDuration('clearCart') })
      }
    }
    logTime('updateSalesChannelStart')
    if (salesChannel) {
      logTime('updateSalesChannelPromise')
      checkout.updateSalesChannel(orderFormId, salesChannel).catch(error => {
        logger.error({ error, message: 'setProfile.updateSalesChannel' })
      })
      logger.debug({ message: 'updateSalesChannel promise created', processingTime: getDuration('updateSalesChannelPromise') })
      response.public.sc.value = salesChannel.toString()
    }
    logger.debug({ message: 'updateSalesChannel block completed', processingTime: getDuration('updateSalesChannelStart') })

    const promises = []
    if (costCenterAddresses.length && orderFormId) {
      const address = costCenterAddresses[0]
      const marketingTags = marketingTagsResponse?.data?.getMarketingTags?.tags || []

      logTime('getRegionId')
      try {
        const [regionId] = await checkout.getRegionId(address.country, address.postalCode, salesChannel?.toString() || '', address.geoCoordinates || [])
        if (regionId?.id) response.public.regionId.value = regionId.id
      } catch (error) {
        logger.error({ error, message: 'setProfile.getRegionId' })
      }
      logger.debug({ message: 'getRegionId completed', processingTime: getDuration('getRegionId') })

      logTime('updateOrderFormMarketingDataShippingClientProfile')
      promises.push(checkout.updateOrderFormMarketingData(orderFormId, {
        attachmentId: 'marketingData',
        marketingTags,
        utmCampaign: user.orgId,
        utmMedium: user.costId,
      }).catch(error => logger.error({ error, message: 'setProfile.updateOrderFormMarketingDataError' })))

      promises.push(checkout.updateOrderFormShipping(orderFormId, {
        address: { ...address, geoCoordinates: address.geoCoordinates || [], isDisposable: true },
        clearAddressIfPostalCodeNotFound: false,
      }).catch(error => logger.error({ error, message: 'setProfile.updateOrderFormShippingError' })))
    }

    logTime('generateClUser')
    const clUser = await generateClUser({
      businessDocument: costCenterData.businessDocument?.replace(/[^a-zA-Z0-9]*/, ''),
      businessName: organization.name,
      clId: user?.clId,
      ctx,
      phoneNumber: costCenterData.phoneNumber,
      stateRegistration: costCenterData.stateRegistration,
      tradeName: organization.tradeName,
      isCorporate: true,
    })
    logger.debug({ message: 'generateClUser completed', processingTime: getDuration('generateClUser') })

    if (clUser && orderFormId) {
      const phoneNumberFormatted = costCenterData.phoneNumber || clUser.phone || clUser.homePhone || `+1${'0'.repeat(10)}`
      promises.push(checkout.updateOrderFormProfile(orderFormId, {
        ...clUser,
        businessDocument: costCenterData.businessDocument?.replace(/[^a-zA-Z0-9]*/, '') || clUser.businessDocument,
        documentType: hasBrazilAddress ? Routes.PROFILE_DOCUMENT_TYPE : undefined,
        phone: phoneNumberFormatted,
        stateInscription: costCenterData.stateRegistration || clUser.stateInscription || '0'.repeat(9),
      }).catch(error => logger.error({ error, message: 'setProfile.updateOrderFormProfileError' })))
    }

    Promise.all(promises) // Fire and forget to avoid timeout
    logger.debug({ message: 'updateOrderFormMarketingDataShippingClientProfile completed', processingTime: getDuration('updateOrderFormMarketingDataShippingClientProfile') })
    logger.info({ 'setProfile.body': JSON.stringify(body), 'setProfile.output': JSON.stringify(response) })

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
