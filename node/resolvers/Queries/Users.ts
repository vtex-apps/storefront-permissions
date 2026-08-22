/* eslint-disable @typescript-eslint/no-explicit-any */
import { removeVersionFromAppId } from '@vtex/api'

import { getCachedAppSettings } from '../../services/appSettingsCache'
import type { GetOrganizationsPaginatedByEmailResponse } from '../../typings/custom'
import { currentSchema } from '../../utils'
import { describeClientError } from '../../utils/clientError'
import {
  CUSTOMER_REQUIRED_FIELDS,
  CUSTOMER_SCHEMA_NAME,
} from '../../utils/constants'
import GraphQLError from '../../utils/GraphQLError'
import { getRole } from './Roles'

const config: any = currentSchema('b2b_users')

const PAGINATION = {
  page: 1,
  pageSize: 50,
}

// This function checks if given email is an user part of a buyer org.
export const isUserPartOfBuyerOrg = async (email: string, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const where = `email=${email}`
  const resp = await masterdata.searchDocumentsWithPaginationInfo({
    dataEntity: config.name,
    fields: ['id'], // we don't need to fetch all fields, only if there is an entry or not
    pagination: {
      page: 1,
      pageSize: 1, // we only need to know if there is at least one user entry
    },
    schema: config.version,
    ...(where ? { where } : {}),
  })

  const { data } = resp as unknown as {
    data: any
  }

  if (data.length > 0) {
    return true
  }

  return false
}

async function processChunks(
  requests: Array<() => Promise<any>>,
  index = 0,
  responses: any[] = [],
  maxConcurrency = 30
): Promise<any[]> {
  if (index >= requests.length) {
    return responses
  }

  const chunk = requests.slice(index, index + maxConcurrency)
  const chunkResponses = await Promise.all(chunk.map((fn) => fn()))

  return processChunks(requests, index + maxConcurrency, [
    ...responses,
    ...chunkResponses,
  ])
}

export const getAllUsers = async ({
  masterdata,
  logger,
  where,
}: {
  masterdata: any
  logger: any
  where?: string
}) => {
  try {
    const initialResp = await masterdata.searchDocumentsWithPaginationInfo({
      dataEntity: config.name,
      fields: ['id'],
      pagination: { page: 1, pageSize: PAGINATION.pageSize },
      schema: config.version,
      ...(where ? { where } : {}),
    })

    const totalItems = initialResp.pagination.total
    const totalPages = Math.ceil(totalItems / PAGINATION.pageSize)

    const requests = Array.from(
      { length: totalPages },
      (_, i) => async () =>
        masterdata.searchDocumentsWithPaginationInfo({
          dataEntity: config.name,
          fields: [
            'id',
            'roleId',
            'clId',
            'email',
            'name',
            'orgId',
            'costId',
            'userId',
            'canImpersonate',
            'active',
          ],
          pagination: { page: i + 1, pageSize: PAGINATION.pageSize },
          schema: config.version,
          sort: 'id asc',
          ...(where ? { where } : {}),
        })
    )

    const responses = await processChunks(requests)

    const users = responses.reduce((acc: any[], resp: { data: any }) => {
      acc.push(...resp.data)

      return acc
    }, [])

    return users
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.getAllUsersByEmail-error',
    })
    throw new Error(error)
  }
}

export const getAllUsersByEmail = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { email, orgId, costId, active } = params

  let where = `email=${email}`

  if (orgId) {
    where += ` AND orgId=${orgId}`
  }

  if (costId) {
    where += ` AND costId=${costId}`
  }

  if (active !== undefined) {
    where += ` AND active=${active}`
  }

  return getAllUsers({ masterdata, logger, where })
}

export const getActiveUserByEmail = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    vtex: { logger },
  } = ctx

  try {
    // Fast path: setActiveUserByOrganization keeps at most one record active
    // per email, so filtering in Master Data returns 0..1 records in a single
    // call. Scanning every record for the email instead (3+ pages for
    // multi-organization users) is both slower and unsafe: whenever the
    // paginated scan misses the active row, a `users[0]` fallback lands the
    // shopper in an arbitrary organization.
    const activeUsers = await getAllUsersByEmail(
      null,
      { ...params, active: true },
      ctx
    )

    if (activeUsers.length > 1) {
      // Data corruption (e.g. a race between two organization switches).
      // getAllUsers sorts by id, so picking the first is still deterministic.
      logger.warn({
        email: params.email,
        message: 'getActiveUserByEmail-multipleActiveRecords',
        recordIds: activeUsers.map((user: any) => user.id),
      })
    }

    let userFound = activeUsers[0]

    // No explicit selection, but the session already carries an organization
    // from a previous transform: keep it. Without this the resolution below is
    // re-derived on every transform. For a shopper holding many records the
    // scan below is not stable, so re-deriving lets the organization change
    // between requests: stickiness breaks and switching cost center looks like
    // it does nothing. Targeted lookup, so it stays a single Master Data call.
    if (!userFound && params.stickyOrgId) {
      // Match the exact organization *and* cost center the session was
      // resolved to. A shopper can hold several records in the same
      // organization, one per cost center, so matching on the organization
      // alone would pick an arbitrary one and reintroduce the same drift one
      // level down.
      const stickyUsers = await getAllUsersByEmail(
        null,
        {
          email: params.email,
          orgId: params.stickyOrgId,
          ...(params.stickyCostId ? { costId: params.stickyCostId } : {}),
        },
        ctx
      )

      userFound = stickyUsers[0]

      if (!userFound && params.stickyCostId) {
        // The cost center is gone, but the organization itself may still be
        // available to this shopper: stay in it rather than falling all the
        // way back to an unrelated organization.
        const sameOrgUsers = await getAllUsersByEmail(
          null,
          { email: params.email, orgId: params.stickyOrgId },
          ctx
        )

        userFound = sameOrgUsers[0]

        if (userFound) {
          logger.warn({
            email: params.email,
            message: 'getActiveUserByEmail-stickyCostCenterNoLongerAvailable',
            stickyCostId: params.stickyCostId,
            stickyOrgId: params.stickyOrgId,
          })
        }
      }

      if (!userFound) {
        // The user no longer has a record for the organization the session was
        // pinned to (removed from it, or the record was deleted).
        logger.warn({
          email: params.email,
          message: 'getActiveUserByEmail-stickyOrgNoLongerAvailable',
          stickyOrgId: params.stickyOrgId,
        })
      }
    }

    if (!userFound) {
      // Legitimate state: records are created with active=false, so a user who
      // never picked an organization has none active. Fall back to the first
      // record of the id-sorted scan, which is deterministic across pods and
      // requests - an unordered pick would land the shopper in a different
      // organization from one request to the next.
      //
      // Read-only on purpose: which record is active belongs to the shopper
      // (organization switch) or the account admin, never to this resolution.
      // setProfile validates the organization downstream and, when it has to
      // serve a different one, does so for the response only - the session pin
      // keeps that choice stable across requests without writing anything.
      const allUsers = await getAllUsersByEmail(null, params, ctx)

      userFound = allUsers[0]

      if (userFound) {
        logger.warn({
          email: params.email,
          fallbackOrgId: userFound.orgId,
          fallbackRecordId: userFound.id,
          message: 'getActiveUserByEmail-noActiveRecord',
          totalRecords: allUsers.length,
        })
      }
    }

    if (!userFound) {
      logger.warn({
        email: params.email,
        message: `getActiveUserByEmail-userNotFound`,
      })
    }

    return {
      ...userFound,
      email: userFound?.email || '',
      name: userFound?.name || '',
    }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: `getActiveUserByEmail-error`,
    })

    return { message: error, status: 'error' }
  }
}

/**
 * @deprecated
 * @param _
 * @param params
 * @param ctx
 */
export const getUserByEmail = async (_: any, params: any, ctx: Context) => {
  const user = await getActiveUserByEmail(_, params, ctx)

  return [user]
}

export const getUserById = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterDataExtended },
    vtex: { logger },
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterDataExtended.getDocumentById(
      CUSTOMER_SCHEMA_NAME,
      id,
      [
        'email',
        'firstName',
        'lastName',
        'document',
        'documentType',
        'phone',
        'homePhone',
        'corporateName',
        'tradeName',
        'corporateDocument',
        'stateInscription',
        'corporatePhone',
        'isCorporate',
      ]
    )

    return cl ?? null
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.getUserById-error',
    })

    return { status: 'error', message: error }
  }
}

export const checkCustomerSchema = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { schema },
  } = ctx

  const latestSchema = await schema.getLatestSchema(CUSTOMER_SCHEMA_NAME)

  if (!latestSchema) {
    return { status: 'error', message: 'Schema not found' }
  }

  const {
    schema: { required },
  } = latestSchema

  const diff = required.filter(
    (value: any) => !CUSTOMER_REQUIRED_FIELDS.includes(value)
  )

  return diff.length <= 0
}

export const getB2BUserById = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const { id } = params

    const user = await masterdata.getDocument({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'name',
        'email',
        'clId',
        'orgId',
        'costId',
        'userId',
        'canImpersonate',
        'selectedPriceTable',
      ],
      id,
    })

    return user
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.getUserById-error',
    })

    return { status: 'error', message: error }
  }
}

export const getUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterdata.getDocument({
      dataEntity: CUSTOMER_SCHEMA_NAME,
      fields: ['firstName', 'lastName', 'email', 'userId'],
      id,
    })

    if (!cl) {
      return null
    }

    const user: any = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'clId',
        'orgId',
        'costId',
        'userId',
        'canImpersonate',
      ],
      pagination: { page: 1, pageSize: 90 },
      schema: config.version,
      where: `clId=${id}`,
    })

    return user.length
      ? {
          ...user[0],
          email: cl.email,
          name: `${cl.firstName} ${cl.lastName}`,
        }
      : {
          canImpersonate: false,
          clId: id,
          email: cl.email,
          name: `${cl.firstName} ${cl.lastName}`,
          roleId: null,
          userId: cl.userId,
        }
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.getUser-error',
    })

    return { status: 'error', message: error }
  }
}

export const getUserByRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { id } = params

  try {
    return await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'userId',
        'orgId',
        'costId',
        'name',
        'email',
        'canImpersonate',
      ],
      pagination: { page: 1, pageSize: 90 },
      schema: config.version,
      where: `roleId=${id}`,
    })
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.getUserByRole-error',
    })

    return { status: 'error', message: error }
  }
}

export const listAllUsers = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  return getAllUsers({ masterdata, logger })
}

export const listUsers = async (
  _: any,
  {
    organizationId = '',
    costCenterId = '',
    roleId = '',
  }: { organizationId: string; costCenterId: string; roleId: string },
  ctx: Context
) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  let res: any = []

  const whereArray: string[] = []

  if (organizationId) {
    whereArray.push(`orgId=${organizationId}`)
  }

  if (costCenterId) {
    whereArray.push(`costId=${costCenterId}`)
  }

  if (roleId) {
    whereArray.push(`roleId=${roleId}`)
  }

  const where = whereArray.join(' AND ')

  try {
    res = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'userId',
        'clId',
        'orgId',
        'costId',
        'name',
        'email',
        'canImpersonate',
      ],
      pagination: { page: 1, pageSize: 50 },
      schema: config.version,
      ...(where && { where }),
    })

    return res
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.listUsers-error',
    })

    return { status: 'error', message: error }
  }
}

export const listUsersPaginated = async (
  _: any,
  {
    organizationId = '',
    costCenterId = '',
    roleId = '',
    page = 1,
    pageSize = 25,
    search = '',
    sortOrder = 'asc',
    sortedBy = 'email',
  }: {
    organizationId: string
    costCenterId: string
    roleId: string
    page: number
    pageSize: number
    search: string
    sortOrder: string
    sortedBy: string
  },
  ctx: Context
) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const whereArray: string[] = []

  if (organizationId) {
    whereArray.push(`orgId=${organizationId}`)
  }

  if (costCenterId) {
    whereArray.push(`costId=${costCenterId}`)
  }

  if (roleId) {
    whereArray.push(`roleId=${roleId}`)
  }

  let whereSearchFields: any[] = []

  if (search && search.length > 0) {
    const fields = ['email', 'name']

    whereSearchFields = fields.map((field) => `${field}="*${search}*"`)
  }

  let where = `${whereArray.join(' AND ')}`

  if (whereSearchFields.length > 0) {
    if (where.length > 0) {
      where += ' AND '
    }

    where += `(${whereSearchFields.join(' OR ')})`
  }

  try {
    return await masterdata.searchDocumentsWithPaginationInfo({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'userId',
        'clId',
        'orgId',
        'costId',
        'name',
        'email',
        'canImpersonate',
      ],
      pagination: { page, pageSize },
      schema: config.version,
      sort: `${sortedBy} ${sortOrder}`,
      ...(where && { where }),
    })
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'Profiles.listUsersPaginated-error',
    })

    return { status: 'error', message: error }
  }
}

const getRoleAndPermissionsByEmail = async ({
  email,
  module,
  skipError = false,
  ctx,
}: {
  email: string
  module: string
  skipError: boolean
  ctx: Context
}) => {
  const {
    vtex: { logger },
  } = ctx

  const defaultResponse = {
    permissions: [],
    role: {
      id: '',
      name: '',
      slug: '',
    },
  }

  if (!email) {
    return defaultResponse
  }

  const userData: any = await getUserByEmail(null, { email }, ctx)

  if (!userData.length && !skipError) {
    logger.warn({
      email,
      message: `getRoleAndPermissionsByEmail-userNotFound`,
    })
    throw new Error('User not found')
  }

  if (!userData.length) {
    return defaultResponse
  }

  const userRole: any = await getRole(null, { id: userData[0].roleId }, ctx)

  if (!userRole && !skipError) {
    logger.warn({
      message: `getRoleAndPermissionsByEmail-roleNotFound`,
      roleId: userData[0].roleId,
    })

    throw new Error('Role not found')
  }

  if (!userRole) {
    return defaultResponse
  }

  const currentModule = userRole.features?.find((feature: any) => {
    return feature.module === module
  })

  return {
    permissions: currentModule?.features || [],
    role: {
      id: userRole.id,
      name: userRole.name,
      slug: userRole.slug,
    },
  }
}

export const checkUserPermission = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    vtex: { logger },
  } = ctx

  const { sessionData, sender }: any = ctx.vtex

  const skipError = params?.skipError ?? false

  if (!sessionData?.namespaces && !skipError) {
    logger.warn({
      message: `checkUserPermission-userNotAuthenticated`,
    })
    throw new GraphQLError(
      'User not authenticated, make sure the query is private',
      {
        logLevel: 'warn',
      }
    )
  }

  if (!sender && !skipError) {
    logger.warn({
      message: `checkUserPermission-senderNotFound`,
    })
    throw new GraphQLError(
      'Sender not available, make sure the query is private',
      {
        logLevel: 'warn',
      }
    )
  }

  const authEmail =
    sessionData?.namespaces?.authentication?.storeUserEmail?.value

  const profileEmail = sessionData?.namespaces?.profile?.email?.value

  const defaultResponse = {
    permissions: [],
    role: {
      id: '',
      name: '',
      slug: '',
    },
  }

  if (!sender) {
    return defaultResponse
  }

  const module = removeVersionFromAppId(sender)

  // Both impersonation flows (vtex.telemarketing and the Organizations app)
  // switch the profile namespace to the impersonated user while
  // authentication.storeUserEmail keeps holding the acting user, so a
  // divergence between the two is what identifies an impersonation session.
  const isImpersonating = Boolean(profileEmail) && authEmail !== profileEmail

  if (!isImpersonating) {
    return getRoleAndPermissionsByEmail({
      ctx,
      email: authEmail,
      module,
      skipError: true,
    })
  }

  // Only impersonation sessions need the setting, so regular sessions never
  // pay for reading it (cached for 5 minutes when they do).
  const appSettings = await getCachedAppSettings(ctx).catch((error) => {
    logger.warn({ error: describeClientError(error), message: 'checkUserPermission-getAppSettingsError' })

    return {} as Record<string, unknown>
  })

  // Strict mode: scope the evaluation to the impersonated profile so the
  // acting user's elevated permissions never reach the storefront.
  if ((appSettings as any)?.strictImpersonationPermissions) {
    return getRoleAndPermissionsByEmail({
      ctx,
      email: profileEmail,
      module,
      skipError: true,
    })
  }

  // Aggregated mode (default): keep the legacy union, which flows relying on
  // the acting user's rights while impersonating depend on - for example a
  // sales representative completing checkout for a buyer role that has no
  // can-checkout permission, or an approver retaining approval power.
  const [authPermissions, profilePermissions] = await Promise.all([
    getRoleAndPermissionsByEmail({
      ctx,
      email: authEmail,
      module,
      skipError: true,
    }),
    getRoleAndPermissionsByEmail({
      ctx,
      email: profileEmail,
      module,
      skipError: true,
    }),
  ])

  return {
    permissions: [
      ...new Set([
        ...authPermissions.permissions,
        ...profilePermissions.permissions,
      ]),
    ],
    role: authPermissions.role.id
      ? authPermissions.role
      : profilePermissions.role,
  }
}

export const checkImpersonation = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { profileSystem, fullSessions },
    vtex: { logger },
  } = ctx

  const { sessionData }: any = ctx.vtex
  const { request }: any = ctx

  if (!sessionData?.namespaces) {
    logger.warn({
      message: `checkImpersonation-userNotAuthenticated`,
    })
    throw new Error('User not authenticated, make sure the query is private')
  }

  const profile = sessionData?.namespaces?.profile
  const sfp = sessionData?.namespaces['storefront-permissions']

  const allSessions = await fullSessions.getSessions({
    headers: {
      cookie: `VtexIdclientAutCookie=${request.headers.vtexidclientautcookie};vtex_session=${request.headers['x-vtex-session']}`,
    },
  })

  const authEmail =
    allSessions?.namespaces?.authentication?.storeUserEmail?.value ??
    allSessions?.namespaces?.authentication?.adminUserEmail?.value

  let response = null

  if (
    authEmail &&
    profile?.email?.value !== authEmail &&
    sfp?.storeUserId?.value &&
    profile?.id?.value &&
    sfp?.storeUserId?.value === profile?.id?.value
  ) {
    const userData: any = await profileSystem
      .getProfileInfo(profile.id.value)
      .catch(() => null)

    if (!userData) {
      response = { error: 'User not found' }
    } else {
      response = {
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        userId: userData.userId,
      }
    }
  }

  return response
}

/**
 * @deprecated
 * @param _
 * @param params
 * @param ctx
 */
export const getUsersByEmail = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { email } = params

  try {
    return await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'clId',
        'email',
        'name',
        'orgId',
        'costId',
        'userId',
        'canImpersonate',
        'active',
      ],
      pagination: { page: 1, pageSize: 50 },
      schema: config.version,
      where: `email = "${email}"`,
    })
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: `getUsersByEmail-error`,
    })
    throw new Error(error)
  }
}

export const getOrganizationsByEmail = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    vtex: { logger },
  } = ctx

  const { email } = params

  try {
    return (await getAllUsersByEmail(null, { email }, ctx)).map(
      (user: any) => ({
        clId: user.clId,
        costId: user.costId,
        id: user.id,
        orgId: user.orgId,
        roleId: user.roleId,
      })
    )
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: `getOrganizationsByEmail-error`,
    })

    return { status: 'error', message: error }
  }
}

export const getOrganizationsPaginatedByEmail = async (
  _: any,
  {
    email = '',
    page = 1,
    pageSize = 25,
  }: {
    email: string
    page: number
    pageSize: number
  },
  ctx: Context
) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const data: GetOrganizationsPaginatedByEmailResponse =
      await masterdata.searchDocumentsWithPaginationInfo({
        dataEntity: config.name,
        fields: ['clId', 'costId', 'id', 'orgId', 'roleId'],
        pagination: { page, pageSize },
        schema: config.version,
        where: `email = "${email}"`,
      })

    return data
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: 'getOrganizationsPaginatedByEmail-error',
    })

    throw new Error(error)
  }
}

type UserByEmail = {
  id: string
  roleId: string
  clId: string | null
  email: string | null
  name: string | null
  orgId: string | null
  costId: string | null
  userId: string | null
  canImpersonate: boolean
  active: boolean
}

export const getUserByEmailOrgIdAndCostId = async (
  _: any,
  params: any,
  ctx: Context
): Promise<UserByEmail | null> => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { email, costId, orgId } = params

  try {
    const user = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: [
        'id',
        'roleId',
        'clId',
        'email',
        'name',
        'orgId',
        'costId',
        'userId',
        'canImpersonate',
        'active',
      ],
      pagination: { page: 1, pageSize: 50 },
      schema: config.version,
      where: `email = "${email}" AND costId = "${costId}" AND orgId = "${orgId}"`,
    })

    return (user[0] as UserByEmail) || null
  } catch (error) {
    logger.error({
      error: describeClientError(error),
      message: `getUsersByEmail-error`,
    })
    throw new Error(error)
  }
}
