import { ForbiddenError } from '@vtex/api'
import { json } from 'co-body'

import { getCachedAppSettings } from '../../services/appSettingsCache'
import { toHash } from '../../utils'
import {
  COST_CENTER_DATA_ENTITY,
  COST_CENTER_FIELDS,
  ORGANIZATION_DATA_ENTITY,
  ORGANIZATION_FIELDS,
} from '../../utils/constants'
import { getRole } from '../Queries/Roles'
import { getSessionWatcher } from '../Queries/Settings'
import { generateClUser, getUserOrganizationsData } from './utils'
import {
  getActiveUserByEmail,
  getUserByEmail,
  getB2BUserById,
} from '../Queries/Users'
import { getUser, setActiveUserByOrganization } from '../Mutations/Users'

type SetProfileStepTiming = {
  durationMs?: number
  failed?: boolean
  step: string
  stepMs?: number
  totalMs: number
}

type SetProfileLogContext = {
  debug: boolean
  orderFormId?: string
}

const createSetProfileTimers = (
  logger: Context['vtex']['logger'],
  logContext: SetProfileLogContext
) => {
  const timing = { prev: Date.now(), t0: Date.now() }
  const steps: SetProfileStepTiming[] = []

  const emitTiming = (payload: Record<string, unknown>) => {
    if (!logContext.debug) {
      return
    }

    logger.debug({
      message: 'setProfile.timing',
      orderFormId: logContext.orderFormId,
      ...payload,
    })
  }

  const logSetProfileStep = (step: string, extra?: Record<string, unknown>) => {
    if (!logContext.debug) {
      return
    }

    const now = Date.now()
    const stepTiming: SetProfileStepTiming = {
      step,
      stepMs: now - timing.prev,
      totalMs: now - timing.t0,
    }

    steps.push(stepTiming)
    timing.prev = now

    emitTiming({
      step,
      stepMs: stepTiming.stepMs,
      totalMs: stepTiming.totalMs,
      steps: [...steps],
      ...extra,
    })
  }

  const timedSetProfile = async <T>(
    step: string,
    promise: Promise<T>
  ): Promise<T> => {
    if (!logContext.debug) {
      return promise
    }

    const start = Date.now()

    try {
      const result = await promise
      const now = Date.now()
      const stepTiming: SetProfileStepTiming = {
        step,
        durationMs: now - start,
        totalMs: now - timing.t0,
      }

      steps.push(stepTiming)

      emitTiming({
        step,
        durationMs: stepTiming.durationMs,
        totalMs: stepTiming.totalMs,
        steps: [...steps],
      })

      return result
    } catch (error) {
      const now = Date.now()
      const stepTiming: SetProfileStepTiming = {
        step,
        durationMs: now - start,
        failed: true,
        totalMs: now - timing.t0,
      }

      steps.push(stepTiming)

      emitTiming({
        step,
        durationMs: stepTiming.durationMs,
        failed: true,
        totalMs: stepTiming.totalMs,
        steps: [...steps],
      })
      throw error
    }
  }

  return { logSetProfileStep, timedSetProfile }
}

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

    const appSettingsPromise = getCachedAppSettings(ctx).catch((error) => {
      logger.warn({ error, message: 'setProfile.getAppSettingsError' })

      return {} as Record<string, unknown>
    })

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

    const appSettings = await appSettingsPromise
    const logContext: SetProfileLogContext = {
      debug: appSettings.debug === true,
    }

    const { logSetProfileStep, timedSetProfile } = createSetProfileTimers(
      logger,
      logContext
    )

    logSetProfileStep('start')

    const isWatchActive = await timedSetProfile(
      'getSessionWatcher',
      getSessionWatcher(null, null, ctx)
    )

    logSetProfileStep('getSessionWatcher')

    if (!isWatchActive) {
      logSetProfileStep('earlyReturn.sessionWatcherInactive')
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    const body: any = await timedSetProfile('parseBody', json(req))

    logSetProfileStep('parseBody')

    const b2bImpersonate = body?.public?.impersonate?.value
    const telemarketingImpersonate = body?.impersonate?.storeUserId?.value
    const orderFormId = body?.checkout?.orderFormId?.value

    logContext.orderFormId = orderFormId
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
      logSetProfileStep('earlyReturn.ignoreB2B')
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    if (email && b2bImpersonate) {
      try {
        user = (await timedSetProfile(
          'getUser.impersonate',
          getUser({
            masterdata,
            params: { userId: b2bImpersonate },
          })
        )) as {
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
          userId = await timedSetProfile(
            'createRegisterOnProfileSystem',
            profileSystem.createRegisterOnProfileSystem(email, user.name)
          )
        }

        response['storefront-permissions'].storeUserId.value = userId
        response['storefront-permissions'].storeUserEmail.value = user.email
        logSetProfileStep('impersonate.b2b')
      } catch (error) {
        logger.error({ message: 'setProfile.getUserError', error })
        logSetProfileStep('impersonate.b2b.error')
      }
    } else if (telemarketingImpersonate) {
      const telemarketingEmail = body?.impersonate?.storeUserEmail?.value

      response['storefront-permissions'].storeUserId.value =
        telemarketingImpersonate
      response['storefront-permissions'].storeUserEmail.value =
        telemarketingEmail
      email = telemarketingEmail
      logSetProfileStep('impersonate.telemarketing')
    }

    if (!email) {
      logSetProfileStep('earlyReturn.noEmail')
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    if (user === null) {
      user = (await timedSetProfile(
        'getActiveUserByEmail',
        getActiveUserByEmail(null, { email }, ctx).catch((error) => {
          logger.warn({ message: 'setProfile.getUserByEmailError', error })
        })
      )) as {
        orgId: string
        costId: string
        clId: string
        id: string
      }
      logSetProfileStep('getActiveUserByEmail')
    }

    response['storefront-permissions'].userId.value = user?.id

    if (!user?.orgId || !user?.costId) {
      logSetProfileStep('earlyReturn.noOrgOrCostCenter')
      ctx.response.body = response
      ctx.response.status = 200

      return
    }

    response['storefront-permissions'].organization.value = user.orgId

    const getOrganization = async (orgId: any): Promise<any> => {
      return masterDataExtended
        .getDocumentById(ORGANIZATION_DATA_ENTITY, orgId, ORGANIZATION_FIELDS)
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

    const [organizationResponse, costCenterResponse, salesChannels] =
      await Promise.all([
        timedSetProfile('getOrganization', getOrganization(user.orgId)),
        timedSetProfile(
          'getCostCenterById',
          masterDataExtended
            .getDocumentById(
              COST_CENTER_DATA_ENTITY,
              user.costId,
              COST_CENTER_FIELDS
            )
            .catch((error) => {
              if (error?.response?.status !== 404) {
                logger.error({
                  error,
                  message: 'setProfile.getCostCenterById',
                })
              }

              return {}
            })
        ),
        timedSetProfile(
          'getSalesChannel',
          salesChannelClient.getSalesChannel()
        ),
      ])

    logSetProfileStep('parallel.organizationCostCenterSettings')

    let organization: any = organizationResponse
    let userOrgsData: any = null

    // Check if we need to fetch user organizations (for inactive org or invalid cost center)
    const costCenterInvalid = Object.values(costCenterResponse ?? {}).every(
      (value) => value === null
    )

    const organizationInactive = organization.status === 'inactive'
    const needsOrgData = organizationInactive || costCenterInvalid

    if (needsOrgData) {
      userOrgsData = await timedSetProfile(
        'getUserOrganizationsData',
        getUserOrganizationsData(email, ctx).catch((error) => {
          logger.error({
            error,
            message: 'setProfile.getUserOrganizationsData',
          })

          return { validCostCenterId: null, activeOrganization: null }
        })
      )
      logSetProfileStep('getUserOrganizationsData')
    }

    // Handle invalid cost center first
    // when cost center comes without a name, it's because the cost center is deleted
    if (costCenterInvalid && userOrgsData?.validCostCenterId) {
      user.costId = userOrgsData.validCostCenterId
    }

    // Handle inactive organization
    if (organizationInactive) {
      const validOrganization = userOrgsData?.activeOrganization

      if (validOrganization) {
        organization = await timedSetProfile(
          'getOrganization.inactiveFallback',
          getOrganization(validOrganization.orgId)
        )

        await timedSetProfile(
          'setActiveUserByOrganization',
          setActiveUserByOrganization(
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
        )
        logSetProfileStep('inactiveOrganization.switched')
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
      const userWithPriceTable = (await timedSetProfile(
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
      logSetProfileStep('getB2BUserById')
    }

    let facets = [] as any

    if (organization.collections?.length) {
      const collections = organization.collections.map(
        (collection: any) => `productClusterIds=${collection.id}`
      )

      facets = [...facets, ...collections]
    }

    const orgSellers = organization.sellers
    const costCenterSellers = costCenterResponse?.sellers

    const sellersArray = Array.isArray(costCenterSellers)
      ? costCenterSellers
      : Array.isArray(orgSellers)
      ? orgSellers
      : []

    if (sellersArray.length > 0) {
      const sellersList = sellersArray

      const { disableSellersNameFacets, disablePrivateSellersFacets } =
        await timedSetProfile('appSettings.facets', Routes.appSettings(ctx))

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
    logSetProfileStep('resolveFacets')

    response['storefront-permissions'].costcenter.value = user.costId
    const costCenterData = costCenterResponse

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

    logSetProfileStep('resolveAddressAndSalesChannel')

    if (salesChannel) {
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

    // regionId is part of the session response, so it has to be resolved
    // before we answer — everything else below this block only affects the
    // cart/profile, not this response, and is deferred past ctx.response.body.
    //
    // When usePublicPostalCodeForRegion (overwrite on + public.postalCode and public.country set): we do not set public.regionId and we set it to empty;
    // checkout-session will use public.postalCode and public.country for checkout.regionId. We also do not update the cart with an address.
    if (
      selectedAddress &&
      orderFormId &&
      !usePublicPostalCodeForRegion &&
      regionLookupSalesChannel
    ) {
      try {
        const [regionId] = await timedSetProfile(
          'getRegionId',
          checkout.getRegionId(
            selectedAddress.country,
            selectedAddress.postalCode,
            regionLookupSalesChannel.toString(),
            selectedAddress.geoCoordinates
          )
        )

        if (regionId?.id) {
          response.public.regionId = {
            value: regionId.id,
          }
        }

        logSetProfileStep('getRegionId')
      } catch (error) {
        logger.error({
          error,
          message: 'setProfile.getRegionId',
        })
        logSetProfileStep('getRegionId.error')
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

    logSetProfileStep('done', {
      email,
      orgId: user?.orgId,
      costId: user?.costId,
      orderFormId,
    })

    logger.info({
      'setProfile.body': JSON.stringify(body),
      'setProfile.output': JSON.stringify(response),
      orderFormId,
    })

    ctx.response.body = response
    ctx.response.status = 200

    // --- Nothing below this line blocks the session response. ---
    // These calls only affect the cart/profile, never the setProfile output,
    // so they run as a detached chain after the response has already been
    // sent. clearCart still has to happen before the shipping/marketing
    // writes that follow it, or it would wipe them straight back out — that
    // ordering is preserved *inside* this chain, it's just off the response's
    // critical path now.
    ;(async () => {
      try {
        if (salesChannel) {
          await timedSetProfile(
            'updateSalesChannel',
            checkout
              .updateSalesChannel(orderFormId, salesChannel)
              .catch((error) => {
                logger.error({
                  error,
                  message: 'setProfile.updateSalesChannel',
                })
              })
          )
        }

        if (hashChanged && orderFormId) {
          try {
            const [b2bSettingsResponse, marketingTagsResponse] =
              await Promise.all([
                timedSetProfile(
                  'getB2BSettings',
                  organizations.getB2BSettings()
                ),
                timedSetProfile(
                  'getMarketingTags',
                  organizations.getMarketingTags(user.costId)
                ),
              ])

            const b2bSettings = (b2bSettingsResponse as any)?.data
              ?.getB2BSettings

            const {
              uiSettings: { clearCart },
            } = b2bSettings ?? { uiSettings: { clearCart: null } }

            if (clearCart) {
              await timedSetProfile(
                'clearCart',
                checkout.clearCart(orderFormId)
              )
            }

            if (selectedAddress && orderFormId) {
              const marketingTags: any = (marketingTagsResponse as any)?.data
                ?.getMarketingTags?.tags

              await timedSetProfile(
                'updateOrderFormMarketingData',
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
                await timedSetProfile(
                  'updateOrderFormShipping',
                  checkout
                    .updateOrderFormShipping(orderFormId, {
                      address: {
                        ...selectedAddress,
                        geoCoordinates: selectedAddress.geoCoordinates ?? [],
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
          } catch (error) {
            logger.error({
              error,
              message: 'setProfile.clearCart',
            })
          }

          logSetProfileStep('clearCart')
        }

        const clUser = await timedSetProfile(
          'generateClUser',
          generateClUser({
            businessDocument,
            businessName,
            clId: user?.clId ?? '',
            ctx,
            phoneNumber: phoneNumber ?? null,
            stateRegistration,
            tradeName,
            isCorporate,
          })
        )

        logSetProfileStep('generateClUser')

        if (clUser && orderFormId) {
          const phoneNumberFormatted =
            phoneNumber ||
            clUser.phone ||
            clUser.homePhone ||
            `+1${'0'.repeat(10)}`

          await timedSetProfile(
            'updateOrderFormProfile',
            checkout
              .updateOrderFormProfile(orderFormId, {
                ...clUser,
                businessDocument:
                  (businessDocument || clUser.businessDocument) ?? null,
                documentType: documentType ?? undefined,
                phone: phoneNumberFormatted,
                stateInscription:
                  stateRegistration ??
                  clUser.stateInscription ??
                  '0'.repeat(9) ??
                  null,
              })
              .catch((error) => {
                logger.error({
                  error,
                  message: 'setProfile.updateOrderFormProfileError',
                })
              })
          )
        }
      } catch (error) {
        logger.error({
          error,
          message: 'setProfile.deferredPostResponse',
        })
      }
    })()
  },
}
