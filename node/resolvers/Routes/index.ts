import { ForbiddenError } from '@vtex/api'
import { json } from 'co-body'

import {
  getCachedActiveUserByEmail,
  getCachedActiveUserForPermissions,
  setActiveUserCacheTtl,
} from '../../services/activeUserCache'
import { getCachedAppSettings } from '../../services/appSettingsCache'
import {
  getCachedB2BSettings,
  getCachedCostCenter,
  getCachedOrganization,
} from '../../services/organizationsCache'
import { getCachedRegionId } from '../../services/regionCache'
import { getCachedSalesChannel } from '../../services/salesChannelCache'
import { getCachedSessionWatcher } from '../../services/sessionWatcherCache'
import { toHash } from '../../utils'
import { createTimer, getTimer } from '../../utils/requestTimings'
import { getUser, setActiveUserByOrganization } from '../Mutations/Users'
import { getRole } from '../Queries/Roles'
import { getActiveUserByEmail, getB2BUserById } from '../Queries/Users'
import { generateClUser, getUserOrganizationsData } from './utils'

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

    // Same array shape getUserByEmail returned, but served from the short-lived
    // permissions cache: this route is called per request by sibling B2B apps.
    // The fetcher rethrows getActiveUserByEmail's resolved error sentinel so a
    // Master Data failure is never cached as a user; the catch reconstitutes it
    // to preserve the route's original (uncached) behavior for this request.
    const userData: any = [
      await getCachedActiveUserForPermissions(ctx, params.email, async () => {
        const activeUser: any = await getActiveUserByEmail(
          null,
          { email: params.email },
          ctx
        )

        if (activeUser?.status === 'error') {
          throw activeUser.message
        }

        // A miss must not be cached (replication lag would pin it); throwing
        // keeps it out of the cache, and the catch below restores the exact
        // uncached shape this route always produced for a missing user.
        if (!activeUser?.id) {
          const notFound: any = new Error('checkPermissions.userNotFound')

          notFound.userNotFound = true
          throw notFound
        }

        return activeUser
      }).catch((error) =>
        error?.userNotFound
          ? { email: '', name: '' }
          : { message: error, status: 'error' }
      ),
    ]

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
      },
      req,
      vtex: { logger },
    } = ctx

    // Provided by the withRequestTimings middleware, which emits the timings for
    // both outcomes. The fallback keeps this callable outside that chain.
    const timer = getTimer(ctx) ?? createTimer()

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

    const isWatchActive = await timer.track(
      'getSessionWatcher',
      getCachedSessionWatcher(ctx)
    )

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

    /**
     * Written into the session by setCurrentOrganization on every organization
     * switch. Used as part of the active-user cache key so that switching
     * organization misses the cache instead of reading the previous one.
     */
    const currentCostCenter = body?.public?.b2bCurrentCostCenter?.value ?? null

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

    // Kick off request/user-independent lookups now so their (cold) latency
    // overlaps with the user + organization lookups below, instead of being
    // awaited serially in a single batch. These are read-only and only fire
    // once we know this is an authenticated (email-bearing) session.
    const salesChannelsPromise = timer.track(
      'getSalesChannel',
      getCachedSalesChannel(ctx)
    )
    // b2bSettings is only consumed by the (conditional) clearCart branch, so it
    // may never be awaited; guard against unhandled rejections.
    const b2bSettingsPromise = timer
      .track(
        'getB2BSettings',
        getCachedB2BSettings(ctx, () => organizations.getB2BSettings())
      )
      .catch((error) => {
        logger.error({ error, message: 'setProfile.getB2BSettings' })

        return null
      })
    const appSettingsPromise = timer.track(
      'getCachedAppSettings',
      getCachedAppSettings(ctx)
    )

    // These two start before the user checks below, so an early return would
    // leave their rejections unhandled and crash the worker. Observing here
    // marks them handled; the awaits further down still see the real rejection.
    salesChannelsPromise.catch(() => undefined)
    appSettingsPromise.catch(() => undefined)

    if (user === null) {
      // getActiveUserByEmail resolves Master Data failures into an error
      // sentinel instead of rejecting. Rethrow it inside the fetcher so neither
      // cache layer can store an outage as a valid "user without organization"
      // (which would produce empty B2B sessions until the TTL expired), and
      // handle the failure outside the cached call so it is retried next time.
      const fetchActiveUser = async () => {
        const activeUser: any = await getActiveUserByEmail(null, { email }, ctx)

        if (activeUser?.status === 'error') {
          throw activeUser.message
        }

        // "No B2B user" must not be cached either: right after provisioning or
        // during replication lag, caching the miss would pin this shopper to an
        // empty B2B session for the whole TTL. Throwing keeps the miss out of
        // both layers, which simply restores the pre-cache behavior (a lookup
        // per transform) for non-B2B shoppers.
        if (!activeUser?.orgId || !activeUser?.costId) {
          const notFound: any = new Error('setProfile.userNotFound')

          notFound.userNotFound = true
          throw notFound
        }

        return activeUser
      }

      const cachedUser: any = await timer
        .track(
          'getActiveUserByEmail',
          getCachedActiveUserByEmail(ctx, email, currentCostCenter, fetchActiveUser)
        )
        .catch((error) => {
          if (!error?.userNotFound) {
            logger.warn({ message: 'setProfile.getUserByEmailError', error })
          }
        })

      // Clone: the memory cache hands out the same object reference, and the
      // invalid-cost-center / inactive-organization branches below reassign
      // orgId/costId on it. Mutating the shared entry would corrupt the cache
      // under its original key for every later request.
      user = (cachedUser ? { ...cachedUser } : cachedUser) as {
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
      return getCachedOrganization(ctx, String(orgId), () =>
        masterDataExtended
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

            // Rethrow so a transient Master Data failure fails only this
            // request. Swallowing it here would make the cache store an empty
            // organization for its full TTL, turning one blip into minutes of
            // errors served from cache.
            throw error
          })
      )
    }

    // Reassigned by the inactive-organization fallback below.
    const hash = toHash(`${user.orgId}|${user.costId}`)
    let hashChanged = body?.['storefront-permissions']?.hash?.value !== hash

    response['storefront-permissions'].hash.value = hash

    // Best-effort context, so a request that throws before finishing still
    // reports which organization it was serving. Refined at the end.
    timer.meta.extra = {
      hasOrderFormId: !!orderFormId,
      hashChanged,
      orgId: user.orgId,
    }

    // Marketing tags only feed a fire-and-forget cart update further down, so
    // keep them off the critical path (do not await here).
    const marketingTagsPromise = organizations
      .getMarketingTags(user.costId)
      .catch((error) => {
        logger.error({ error, message: 'setProfile.getMarketingTags' })

        return null
      })

    // Read into locals so the cache fetcher below does not close over `user`,
    // which is reassigned further down.
    const resolvedCostId = user.costId

    // Only these two genuinely depend on the resolved user (orgId/costId).
    // costCenterResponse is reassigned when the inactive-organization fallback
    // below adopts a different cost center.
    const [organizationResponse, initialCostCenterResponse] = await Promise.all(
      [
        timer.track('getOrganization', getOrganization(user.orgId)),
        timer.track(
          'getCostCenterById',
          getCachedCostCenter(ctx, String(resolvedCostId), () =>
            organizations.getCostCenterById(resolvedCostId)
          )
        ),
      ]
    )

    let costCenterResponse: any = initialCostCenterResponse

    // These were started earlier; by now their latency is largely hidden
    // behind the user + organization lookups above. Tracking the wait itself
    // shows how much (if any) still lands on the critical path.
    const [salesChannels, appSettings] = await timer.track(
      'awaitIndependent',
      Promise.all([salesChannelsPromise, appSettingsPromise])
    )

    setActiveUserCacheTtl(ctx, (appSettings as any)?.sessionUserCacheTtlMs)

    // Hand the account's limits to the middleware that emits the timings.
    timer.meta.sampleRate = (appSettings as any)?.sessionTimingsSampleRate
    timer.meta.slowThresholdMs = (appSettings as any)
      ?.sessionTimingsSlowThresholdMs

    // in case the cost center is not found, we need to find a valid cost center for the user
    if (
      Object.values(costCenterResponse.data?.getCostCenterById ?? {}).every(
        (value) => value === null
      )
    ) {
      try {
        const usersByEmail = await timer.track(
          'getOrganizationsByEmail',
          organizations.getOrganizationsByEmail(email)
        )

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
    let userOrgsData: any = null

    // Check if we need to fetch user organizations (for inactive org or invalid cost center)
    const costCenterInvalid = Object.values(
      costCenterResponse.data?.getCostCenterById ?? {}
    ).every((value) => value === null)

    const organizationInactive = organization.status === 'inactive'
    const needsOrgData = organizationInactive || costCenterInvalid

    if (needsOrgData) {
      userOrgsData = await timer.track(
        'getUserOrganizationsData',
        getUserOrganizationsData(email, ctx).catch((error) => {
          logger.error({
            error,
            message: 'setProfile.getUserOrganizationsData',
          })

          return { validCostCenterId: null, activeOrganization: null }
        })
      )
    }

    // Handle invalid cost center first
    if (costCenterInvalid && userOrgsData?.validCostCenterId) {
      user.costId = userOrgsData.validCostCenterId
    }

    // Handle inactive organization
    if (organizationInactive) {
      const validOrganization = userOrgsData?.activeOrganization

      if (validOrganization) {
        // getOrganization reads Master Data directly, so it returns the document
        // itself. Unwrapping `.data.getOrganizationById` here is left over from
        // when this went through the b2b-organizations GraphQL client, and it
        // resolved to undefined, throwing on the `organization.name` access
        // below. Note `validOrganization.id` is the b2b_users record id, not the
        // organization id, so the lookup must use `orgId`.
        organization = await getOrganization(validOrganization.orgId)

        // Adopt the fallback locally as well, so this response is stamped with
        // the organization we just activated instead of the inactive one: the
        // session fields, the hash, and the cost center data the cart updates
        // below read from all came from the old organization.
        const fallbackCostId = validOrganization.costId

        user.orgId = validOrganization.orgId
        user.costId = fallbackCostId
        response['storefront-permissions'].organization.value = user.orgId

        // Recompute against the adopted organization: the value derived above
        // used the inactive org's hash, so a session that matched it would
        // report "unchanged" and skip the clearCart branch even though the
        // shopper just moved organizations.
        const fallbackHash = toHash(`${user.orgId}|${user.costId}`)

        response['storefront-permissions'].hash.value = fallbackHash
        hashChanged =
          body?.['storefront-permissions']?.hash?.value !== fallbackHash

        timer.meta.extra = { ...timer.meta.extra, orgId: user.orgId }

        costCenterResponse = await timer.track(
          'getCostCenterById.inactiveFallback',
          getCachedCostCenter(ctx, String(fallbackCostId), () =>
            organizations.getCostCenterById(fallbackCostId)
          )
        )

        await setActiveUserByOrganization(
          null,
          {
            costId: validOrganization.costId,
            email,
            orgId: validOrganization.orgId,
            userId: validOrganization.id,
          },
          ctx
        ).catch((error) => {
          logger.warn({
            error,
            message: 'setProfile.setActiveUserByOrganizationError',
          })
        })
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
      const userWithPriceTable = (await timer.track(
        'getB2BUserById',
        getB2BUserById(null, { id: user.id }, ctx)
      )) as { selectedPriceTable: string }

      const MAX_PRICE_TABLES = 3

      const selectedPriceTable = userWithPriceTable?.selectedPriceTable
        ? userWithPriceTable.selectedPriceTable
        : organization.priceTables.slice(0, MAX_PRICE_TABLES).join(',')

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
    const costCenterSellers =
      costCenterResponse?.data?.getCostCenterById?.sellers

    const sellersArray = Array.isArray(costCenterSellers)
      ? costCenterSellers
      : Array.isArray(orgSellers)
      ? orgSellers
      : []

    if (sellersArray.length > 0) {
      const sellersList = sellersArray

      // Reuse the already-fetched (cached) appSettings instead of issuing a
      // second, uncached getAppSettings round-trip on the sellers path.
      const disableSellersNameFacets = (appSettings as any)
        ?.disableSellersNameFacets
      const disablePrivateSellersFacets = (appSettings as any)
        ?.disablePrivateSellersFacets

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
      costCenterData?.businessDocument?.replace(/[^a-zA-Z0-9]+/g, '') ?? null

    stateRegistration = costCenterData?.stateRegistration ?? null

    const costCenterAddresses =
      (costCenterData as { addresses?: any[] } | undefined)?.addresses ?? []

    const enableCostCenterAddressSelection =
      (appSettings as any)?.enableCostCenterAddressSelection ?? false

    const enableRegionOverwriteFlag =
      (appSettings as any)?.enableRegionOverwrite ?? false

    const deferRegionToCheckoutSessionFlag =
      (appSettings as any)?.deferRegionToCheckoutSession ?? false

    const publicCostCenterAddressId = body?.public?.costCenterAddressId?.value
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
        explicitlyClearedCostCenterAddress
          ? ''
          : selectedAddress?.addressId ?? ''
    } else {
      // No cost center addresses: per docs, costCenterAddressId should be empty
      response['storefront-permissions'].costCenterAddressId.value = ''
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

    const hasOrgSalesChannel = !!salesChannel?.length

    const salesChannelsData =
      (salesChannels as unknown as { data?: any[] })?.data ?? []

    const validChannels = salesChannelsData.filter(
      (channel: any) => channel.IsActive
    )

    const deferSalesChannelToBinding =
      !hasOrgSalesChannel && !!(appSettings as any)?.deferSalesChannelToBinding

    // When the organization has no salesChannel of its own, defaulting it here
    // races with other apps (e.g. vtex.binding-selector) that also patch the
    // session/cart sales channel from the chosen binding. If the merchant opted
    // in, skip that default entirely and let the binding be the source of truth.
    if (
      !deferSalesChannelToBinding &&
      (!salesChannel?.length ||
        !validChannels?.find(
          (validSalesChannel: any) =>
            String(validSalesChannel.Id) === salesChannel.toString()
        ))
    ) {
      if (validChannels.length) {
        salesChannel = validChannels[0].Id
      }
    }

    // Only used for the region lookup below; falls back independently of
    // deferSalesChannelToBinding since it doesn't write to the shared session/cart.
    const regionLookupSalesChannel =
      salesChannel || (validChannels.length ? validChannels[0].Id : null)

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
    } else if (deferSalesChannelToBinding) {
      // Omit `sc` entirely rather than sending `{ value: '' }`: this app treats
      // an explicit empty value as a real write during session merge (see the
      // regionId case below), so leaving the key in would clear whatever
      // already set the session's sales channel (e.g. the binding).
      delete response.public.sc
      logger.info({
        message: 'setProfile.salesChannelDeferredToBinding',
        orgId: user.orgId,
      })
    }

    if (hashChanged && orderFormId) {
      try {
        const b2bSettingsResponse = await b2bSettingsPromise
        const b2bSettings = (b2bSettingsResponse as any)?.data?.getB2BSettings
        const {
          uiSettings: { clearCart },
        } = b2bSettings ?? { uiSettings: { clearCart: null } }

        if (clearCart) {
          await timer.track(
            'updateSalesChannel',
            Promise.all(salesChannelPromise)
          )
          await timer.track('clearCart', checkout.clearCart(orderFormId))
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

      /**
       * vtex.checkout-session performs this exact same region lookup (and caches
       * it), and it is the app that produces the canonical `checkout.regionId`
       * that the platform and the segment actually read. When this is enabled we
       * publish the cost center locality instead of resolving the region here,
       * which removes a call from the session transform.
       *
       * It also fixes an inconsistency: today the cart is regionalized from the
       * cost center address while vtex.search-session, which reads the locality
       * from the public namespace, sees nothing for B2B users.
       *
       * Requires a country and postal code, since that is the input contract of
       * checkout-session; otherwise we fall back to resolving it ourselves.
       */
      const deferRegionToCheckoutSession =
        deferRegionToCheckoutSessionFlag &&
        !usePublicPostalCodeForRegion &&
        !!address.country &&
        !!address.postalCode

      if (deferRegionToCheckoutSession) {
        // Omit `regionId` rather than sending an empty value, so we never clear a
        // region another app (or the storefront) already resolved.
        delete response.public.regionId

        response.public.country = { value: address.country }
        response.public.postalCode = { value: address.postalCode }

        logger.info({
          costId: user.costId,
          message: 'setProfile.regionDeferredToCheckoutSession',
        })
      } else if (!usePublicPostalCodeForRegion && regionLookupSalesChannel) {
        try {
          const regionSalesChannel = regionLookupSalesChannel.toString()

          const [regionId] = await timer.track(
            'getRegionId',
            getCachedRegionId(
              ctx,
              {
                country: address.country,
                geoCoordinates: address.geoCoordinates,
                postalCode: address.postalCode,
                salesChannel: regionSalesChannel,
              },
              () =>
                checkout.getRegionId(
                  address.country,
                  address.postalCode,
                  regionSalesChannel,
                  address.geoCoordinates
                )
            )
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
          reason: usePublicPostalCodeForRegion
            ? 'usePublicPostalCodeForRegion'
            : 'noSalesChannelAvailable',
          publicPostalCode: body?.public?.postalCode?.value ?? null,
        })
      }

      const utmCampaign = user.orgId
      const utmMedium = user.costId

      promises.push(
        marketingTagsPromise
          .then((marketingTagsResponse) => {
            const marketingTags: any = (marketingTagsResponse as any)?.data
              ?.getMarketingTags?.tags

            return checkout.updateOrderFormMarketingData(orderFormId, {
              attachmentId: 'marketingData',
              marketingTags: marketingTags || [],
              utmCampaign,
              utmMedium,
            })
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

    // The CL profile only feeds the fire-and-forget cart update below, so it
    // must not block the response (it measured up to ~1s in spikes). It is also
    // skipped entirely when there is no cart to update, which is the only thing
    // its result was ever used for. Values are read into consts because the
    // surrounding variables are reassigned `let`s and must not be closed over.
    if (orderFormId) {
      const clId = user?.clId ?? ''
      const clBusinessDocument = businessDocument
      const clBusinessName = businessName
      const clDocumentType = documentType
      const clPhoneNumber = phoneNumber
      const clStateRegistration = stateRegistration
      const clTradeName = tradeName

      promises.push(
        generateClUser({
          businessDocument: clBusinessDocument,
          businessName: clBusinessName,
          clId,
          ctx,
          phoneNumber: clPhoneNumber ?? null,
          stateRegistration: clStateRegistration,
          tradeName: clTradeName,
          isCorporate,
        })
          .then((clUser) => {
            if (!clUser) {
              return undefined
            }

            const phoneNumberFormatted =
              clPhoneNumber ||
              clUser.phone ||
              clUser.homePhone ||
              `+1${'0'.repeat(10)}`

            return checkout.updateOrderFormProfile(orderFormId, {
              ...clUser,
              businessDocument:
                (clBusinessDocument || clUser.businessDocument) ?? null,
              documentType: clDocumentType ?? undefined,
              phone: phoneNumberFormatted,
              stateInscription:
                clStateRegistration ?? clUser.stateInscription ?? '0'.repeat(9),
            })
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

    timer.meta.extra = {
      costId: user.costId,
      hasOrderFormId: !!orderFormId,
      hashChanged,
      orgId: user.orgId,
    }

    // Off by default: this used to run on every session transform, which on a
    // route this hot means two JSON.stringify calls per request plus a log line
    // carrying the whole session in and out, including the shopper's email and
    // organization data. Enable it per account only while debugging.
    if ((appSettings as any)?.logSessionPayloads) {
      logger.info({
        'setProfile.body': JSON.stringify(body),
        'setProfile.output': JSON.stringify(response),
      })
    }

    ctx.response.body = response
    ctx.response.status = 200
  },
}
