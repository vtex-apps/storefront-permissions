/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { describeClientError } from '../../utils/clientError'
import {
  COST_CENTER_DATA_ENTITY,
  COST_CENTER_FIELDS,
  CUSTOMER_SCHEMA_NAME,
} from '../../utils/constants'
import type { ChangeTeamParams } from '../../utils/metrics/changeTeam'
import { sendChangeTeamMetric } from '../../utils/metrics/changeTeam'
import { sendObservabilityEvent } from '../../utils/observabilityEvent'
import { createTimer } from '../../utils/requestTimings'
import {
  getAllUsersByEmail,
  getOrganizationsByEmail,
  getUserByEmailOrgIdAndCostId,
} from '../Queries/Users'

const config: any = currentSchema('b2b_users')

const MAX_RETRY = 5
const RETRY_BACKOFF_FACTOR_MS = 100
const MAX_BACKOFF_MS = 1000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const setChangeSession = async (
  sessionParameters: any,
  countRetry = 0
): Promise<void> => {
  const {
    context: {
      clients: { session },
      vtex: { logger },
    },
    publicKey,
    value,
    sessionCookie,
  } = sessionParameters

  try {
    await session.updateSession(publicKey, value, [], sessionCookie)
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'setChangeSession.error',
      attempt: countRetry,
    })

    if (countRetry < MAX_RETRY) {
      countRetry++
      const backoff = Math.min(
        2 ** (countRetry - 1) * RETRY_BACKOFF_FACTOR_MS,
        MAX_BACKOFF_MS
      )

      await delay(backoff)

      return setChangeSession(sessionParameters, countRetry)
    }
  }
}

const addUserToMasterdata = async ({
  masterdata,
  params: { name, email },
}: {
  masterdata: any
  params: { name: string; email: string }
}) => {
  const names = name.split(' ')
  const [firstName] = names

  names.shift()
  const lastName = names.length > 0 ? names.join(' ') : firstName // if it gets the lastName empty, it'll repeat the firstName to avoid errors on the checkout
  const { DocumentId } = await masterdata
    .createDocument({
      dataEntity: CUSTOMER_SCHEMA_NAME,
      fields: {
        email,
        firstName,
        lastName,
      },
    })
    .then((response: { DocumentId: string }) => {
      return response
    })
    .catch((error: any) => {
      if (error.response?.data?.Message === 'duplicated entry') {
        return masterdata
          .searchDocuments({
            dataEntity: CUSTOMER_SCHEMA_NAME,
            fields: ['id'],
            pagination: {
              page: 1,
              pageSize: 1,
            },
            where: `email=${email}`,
          })
          .then((res: [{ id: string }]) => {
            return { DocumentId: res[0].id }
          })
      }

      throw error
    })

  return DocumentId
}

export const getUser = async ({
  masterdata,
  params: { email, id, userId },
}: any) => {
  const where = id || userId ? `id=${id || userId}` : `email=${email}`

  return masterdata
    .searchDocuments({
      dataEntity: config.name,
      fields: [
        'id',
        'email',
        'name',
        'orgId',
        'clId',
        'costId',
        'canImpersonate',
        'roleId',
        'userId',
        'active',
        'selectedPriceTable',
      ],
      pagination: {
        page: 1,
        pageSize: 1,
      },
      schema: config.version,
      where,
    })
    .then((res: any) => {
      return res.length > 0 ? res[0] : null
    })
    .catch(() => null)
}

const updateUserFields = async ({ masterdata, fields, id }: any) => {
  const { DocumentId } = await masterdata
    .createOrUpdateEntireDocument({
      dataEntity: config.name,
      fields,
      id,
      schema: config.version,
    })
    .then((response: { DocumentId: string }) => {
      return response
    })
    .catch((error: any) => {
      if (error.response.status < 400) {
        return {
          DocumentId: id,
        }
      }

      throw error
    })

  return DocumentId
}

const addSelectedPriceTableToB2bUser = async ({
  masterdata,
  fields,
  id,
}: any) => {
  const { DocumentId } = await masterdata
    .createOrUpdatePartialDocument({
      dataEntity: config.name,
      fields,
      id,
      schema: config.version,
    })
    .then((response: { DocumentId: string }) => {
      return response
    })
    .catch((error: any) => {
      if (error.response.status < 400) {
        return {
          DocumentId: id,
        }
      }

      throw error
    })

  return DocumentId
}

const createPermission = async ({ masterdata, params }: any) => {
  const {
    roleId,
    canImpersonate,
    name,
    email,
    userId,
    clId,
    orgId,
    costId,
    id,
  } = params

  await masterdata
    .createOrUpdateEntireDocument({
      dataEntity: config.name,
      fields: {
        canImpersonate,
        clId,
        costId,
        email,
        name,
        orgId,
        roleId,
        userId,
      },
      id,
      schema: config.version,
    })
    .then((response: { DocumentId: string }) => {
      return response
    })
    .catch((error: any) => {
      if (error.response.status < 400) {
        return {
          DocumentId: id,
        }
      }

      throw error
    })
}

export const addUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm },
    vtex: { logger },
  } = ctx

  try {
    const costCenter: { name?: string; organization?: string } =
      await ctx.clients.masterDataExtended.getDocumentById(
        COST_CENTER_DATA_ENTITY,
        params.costId,
        COST_CENTER_FIELDS
      )

    // before adding an user to a cost center we check if the cost
    // center exists and if it has a valid name, otherwise both
    // login and UI might break.
    if (!costCenter?.name || params.orgId !== costCenter?.organization) {
      throw new Error(`Invalid cost center`)
    }

    const cId = await addUserToMasterdata({ masterdata, params })

    const organizations = await getOrganizationsByEmail(
      _,
      { email: params.email },
      ctx
    )

    if (
      organizations &&
      Array.isArray(organizations) &&
      organizations?.find(
        (org: any) => org.orgId === params.orgId && org.costId === params.costId
      )
    ) {
      return {
        message: `Email already exists in the organization and cost center`,
        status: 'duplicated-organization',
      }
    }

    await createPermission({
      lm,
      masterdata,
      params: {
        ...params,
        clId: cId,
      },
    })

    return { status: 'success', message: '', id: cId }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'addUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const updateUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm },
    vtex: { logger },
  } = ctx

  try {
    // check if new user already exists in CL and create profile if not
    if (!params.clId) {
      params.clId = await addUserToMasterdata({ masterdata, params })
    }

    await createPermission({
      lm,
      masterdata,
      params,
    })

    return { status: 'success', message: '', id: params.clId }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'updateUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const deleteUserProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { ids } = params

  try {
    const users: any = []

    ids.forEach((id: string) => {
      users.push(
        masterdata.createOrUpdatePartialDocument({
          dataEntity: config.name,
          fields: { roleId: '' },
          id,
          schema: config.version,
        })
      )
    })

    const result = await Promise.all(users)
      .then((response: any) => {
        return response
      })
      .catch((error: any) => {
        if (error.response.status >= 400) {
          throw error
        }

        logger.error({
          error: describeClientError(error),
          message: 'deleteUserProfile.error',
        })

        return []
      })

    return {
      id: result
        .map((item: { DocumentId: string }) => item.DocumentId)
        .join(','),
      message: '',
      status: result.length > 0 ? 'success' : 'error',
    }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'deleteUserProfile.error',
    })

    return { status: 'error', message: error }
  }
}

export const deleteUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { id } = params

  try {
    await masterdata.deleteDocument({
      dataEntity: config.name,
      id,
    })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'deleteUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const impersonateUser = async (_: any, params: any, ctx: Context) => {
  const {
    vtex: { logger, sessionToken },
  } = ctx

  const { userId } = params

  try {
    await setChangeSession({
      context: ctx,
      publicKey: 'impersonate',
      value: userId,
      sessionCookie: sessionToken,
    })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'impersonateUser.error',
    })

    return { status: 'error', message: error }
  }
}

/**
 *
 * Persist the user in the database
 *
 * @deprecated
 *
 * @param _
 * @param params
 * @param ctx
 */
export const saveUser = async (_: any, params: any, ctx: Context) => {
  return updateUser(_, params, ctx)
}

export const addOrganizationToUser = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { userId, orgId, roleId, costId } = params

  const user = await getUser({ masterdata, params: { userId } })

  if (!user) {
    throw new Error('User not found')
  }

  try {
    const {
      canImpersonate,
      clId,
      email,
      name,
      roleId: roleIdUser,
      userId: id,
    } = user

    return await addUser(
      _,
      {
        active: false,
        canImpersonate,
        clId,
        costId,
        email,
        name,
        orgId,
        roleId: roleId || roleIdUser,
        userId: id,
      },
      ctx
    )
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'addOrganizationToUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const addCostCenterToUser = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { userId, costId } = params

  const user = await getUser({ masterdata, params: { userId } })

  if (!user) {
    throw new Error('User not found')
  }

  try {
    const {
      roleId,
      canImpersonate,
      name,
      email,
      userId: id,
      clId,
      orgId,
    } = user

    return await addUser(
      _,
      {
        active: false,
        canImpersonate,
        clId,
        costId,
        email,
        name,
        orgId,
        roleId,
        userId: id,
      },
      ctx
    )
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'addCostCenterToUser.error',
    })

    return { status: 'error', message: error }
  }
}

const B2B_USERS_SEARCH_PAGE_SIZE = 50

export const setActiveUserByOrganization = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    clients: { masterdata, session },
    vtex: { logger, adminUserAuthToken, sessionToken },
  } = ctx

  const timer = createTimer()
  const extra: Record<string, unknown> = {
    costId: params.costId ?? null,
    orgId: params.orgId ?? null,
  }

  try {
    let userId = null

    if (adminUserAuthToken) {
      userId = params.userId
    } else {
      const sessionData = await timer.track(
        'getSession',
        session
          .getSession(sessionToken as string, ['*'])
          .then((currentSession: any) => {
            return currentSession.sessionData
          })
          .catch((error: any) => {
            logger.error({
              error: describeClientError(error),
              message: 'orders-getSession-error',
            })

            return null
          })
      )

      const currentUserEmail =
        sessionData?.namespaces?.profile?.email?.value ?? params.email

      const userByEmail = (await timer.track(
        'getUserByEmailOrgIdAndCostId',
        getUserByEmailOrgIdAndCostId(
          masterdata,
          {
            costId: params.costId,
            email: currentUserEmail,
            orgId: params.orgId,
          },
          ctx
        )
      )) as any

      userId = userByEmail
        ? userByEmail.id
        : sessionData?.namespaces?.['storefront-permissions']?.userId?.value
    }

    const user = await timer.track(
      'getUser',
      getUser({ masterdata, params: { userId } })
    )

    if (!user) {
      throw new Error('User not found')
    }

    extra.costId = user.costId
    extra.orgId = user.orgId
    extra.userId = user.id

    await timer.track(
      'activate',
      updateUserFields({
        fields: { ...user, active: true },
        id: userId,
        masterdata,
      })
    )

    const users = await timer.track(
      'listUsers',
      getAllUsersByEmail(_, { email: user.email }, ctx)
    )

    const listed = Array.isArray(users) ? users : []
    const deactivateTargets = listed.filter(
      (userSecondary: any) => userSecondary.id !== user.id
    )

    extra.currentlyActiveCount = listed.filter(
      (userSecondary: any) => userSecondary.active
    ).length
    extra.deactivateWrites = deactivateTargets.length
    extra.listedCount = listed.length
    extra.searchPagesEstimate =
      listed.length > 0
        ? Math.ceil(listed.length / B2B_USERS_SEARCH_PAGE_SIZE)
        : 1

    try {
      await timer.track(
        'deactivateOthers',
        Promise.all(
          deactivateTargets.map((userSecondary: any) =>
            updateUserFields({
              fields: {
                ...userSecondary,
                active: false,
              },
              id: userSecondary.id,
              masterdata,
            })
          )
        )
      )
    } catch (error) {
      logger.error({
        error: describeClientError(error),
        message: 'setActiveUserById.error',
      })
    }
  } finally {
    const totalMs = timer.totalMs()
    const steps = Object.keys(timer.timings)
    const slowestStep = steps.reduce(
      (slowest, step) =>
        timer.timings[step] > (timer.timings[slowest] ?? -1) ? step : slowest,
      steps[0] ?? ''
    )

    // Org switch is rare enough to log every call. No email: the listedCount
    // vs deactivateWrites vs currentlyActiveCount is what confirms the MD
    // fan-out (full scan + N-1 entire-document writes).
    logger.info({
      costId: extra.costId ?? null,
      currentlyActiveCount: extra.currentlyActiveCount ?? 0,
      deactivateWrites: extra.deactivateWrites ?? 0,
      listedCount: extra.listedCount ?? 0,
      message: 'setActiveUserByOrganization.timings',
      orgId: extra.orgId ?? null,
      searchPagesEstimate: extra.searchPagesEstimate ?? 0,
      slowestStep,
      slowestStepMs: timer.timings[slowestStep] ?? 0,
      timings: timer.timings,
      totalMs,
      userId: extra.userId ?? null,
    })

    sendObservabilityEvent(ctx, 'set-active-user-by-organization', {
      currentlyActiveCount: Number(extra.currentlyActiveCount ?? 0),
      deactivateWrites: Number(extra.deactivateWrites ?? 0),
      listedCount: Number(extra.listedCount ?? 0),
      totalMs,
    })
  }
}

export const setCurrentOrganization = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    vtex: { logger },
    cookies,
    request,
  } = ctx

  const sessionCookie =
    cookies.get('vtex_session') ?? request.header?.sessiontoken

  const { sessionData } = ctx.vtex as any

  const { orgId, costId } = params

  const {
    email: { value: email },
  } = sessionData.namespaces.profile

  const user = await getUserByEmailOrgIdAndCostId(
    _,
    { email, orgId, costId },
    ctx
  )

  if (!user) {
    const error =
      'This organization/cost center is not allowed to this current user'

    logger.error({
      error: describeClientError(error),
      message: 'updateCurrentOrganization.error',
    })

    return { status: 'error', message: error }
  }

  try {
    await setActiveUserByOrganization(
      _,
      {
        orgId: user.orgId,
        costId: user.costId,
        userId: user.id,
      },
      ctx
    )

    const metricParams: ChangeTeamParams = {
      account: sessionData?.namespaces?.account?.accountName.value,
      userId: user.id,
      userEmail: email,
      orgId,
      costCenterId: costId,
      userRole: user.roleId,
    }

    sendChangeTeamMetric(metricParams)

    await setChangeSession({
      context: ctx,
      publicKey: 'b2bCurrentCostCenter',
      value: costId,
      sessionCookie,
    })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'updateCurrentOrganization.error',
    })

    return { status: 'error', message: error }
  }
}

export const setCurrentPriceTable = async (
  _: any,
  params: { priceTable: string | null },
  ctx: Context
) => {
  const {
    vtex: { logger },
    clients: { masterdata },
  } = ctx

  const { sessionData } = ctx.vtex as any

  try {
    let { priceTable } = params

    // allow setting user priceTable back to null
    if (priceTable === undefined) priceTable = null

    // Get current user's organization
    const {
      'storefront-permissions': {
        organization: { value: orgId },
        userId: { value: userId },
      },
    } = sessionData.namespaces

    if (!orgId || !userId) {
      const error = 'User not properly authenticated with organization context'

      logger.error({
        error: describeClientError(error),
        message: 'setCurrentPriceTable.error.noOrgContext',
      })

      return { status: 'error', message: error }
    }

    // Get organization data to validate price table
    const organization = await ctx.clients.masterDataExtended.getDocumentById(
      'organizations',
      orgId,
      ['priceTables']
    )

    if (
      priceTable != null &&
      !organization?.priceTables?.includes(priceTable)
    ) {
      const error = 'Price table not allowed for this organization'

      logger.error({
        error: describeClientError(error),
        message: 'setCurrentPriceTable.error.invalidPriceTable',
        priceTable,
        orgId,
      })

      return { status: 'error', message: error }
    }

    // Update user's selected price table
    await addSelectedPriceTableToB2bUser({
      masterdata,
      fields: { selectedPriceTable: priceTable },
      id: userId,
    })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'setCurrentPriceTable.error',
    })

    return { status: 'error', message: error }
  }
}

export const ignoreB2BSessionData = async (
  _: void,
  { enabled }: { enabled: boolean },
  ctx: Context
) => {
  const {
    cookies,
    request,
    vtex: { logger },
  } = ctx

  const sessionCookie =
    cookies.get('vtex_session') ?? request.header?.sessiontoken

  try {
    await setChangeSession({
      context: ctx,
      publicKey: 'removeB2B',
      value: enabled,
      sessionCookie,
    })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'removeB2BSessionData.error',
    })

    return { status: 'error', message: error }
  }
}
