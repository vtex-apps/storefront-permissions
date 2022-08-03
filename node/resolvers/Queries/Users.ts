/* eslint-disable @typescript-eslint/no-explicit-any */
import { removeVersionFromAppId } from '@vtex/api'

import { currentSchema } from '../../utils'
import {
  CUSTOMER_REQUIRED_FIELDS,
  CUSTOMER_SCHEMA_NAME,
} from '../../utils/constants'
import { getRole } from './Roles'
import { getAppSettings } from './Settings'

const config: any = currentSchema('b2b_users')

const SCROLL_AWAIT_TIME = 100
const SLEEP_ADD_PERCENTAGE = 0.1
const SCROLL_SIZE = 1000

const sleep = (ms: number) => {
  const time = ms + SLEEP_ADD_PERCENTAGE * ms

  return new Promise((resolve) => setTimeout(resolve, time))
}

export const getUserById = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterdata.getDocument({
      dataEntity: CUSTOMER_SCHEMA_NAME,
      fields: [
        'email',
        'firstName',
        'lastName',
        'document',
        'documentType',
        'phone',
        'corporateName',
        'tradeName',
        'corporateDocument',
        'stateInscription',
        'corporatePhone',
        'isCorporate',
      ],
      id,
    })

    return cl ?? null
  } catch (error) {
    logger.error({
      error,
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
      error,
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
      error,
      message: 'Profiles.getUserByRole-error',
    })

    return { status: 'error', message: error }
  }
}

export const getUserByEmail = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
    vtex: { logger },
  } = ctx

  const { email } = params

  try {
    const cachedUser = await vbase.getJSON('b2b_users', email).catch(() => null)

    if (cachedUser) {
      return [cachedUser]
    }

    return await masterdata
      .searchDocuments({
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
        where: `email=${email}`,
      })
      .catch(() => [])
  } catch (error) {
    logger.error({
      error,
      message: 'Profiles.getUserByEmail-error',
    })

    return { status: 'error', message: error }
  }
}

export const listAllUsers = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    let token: string | undefined
    let hasMore = true
    const users = [] as any[]

    const scrollMasterData = async () => {
      await sleep(SCROLL_AWAIT_TIME)
      const {
        mdToken,
        data,
      }: {
        mdToken: string
        data: any
      } = await masterdata.scrollDocuments({
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
        mdToken: token,
        schema: config.version,
        size: SCROLL_SIZE,
      })

      if (!data.length && token) {
        hasMore = false
      }

      if (!token && mdToken) {
        token = mdToken
      }

      users.push(...data)

      if (hasMore) {
        await scrollMasterData()
      }
    }

    await scrollMasterData()

    return users
  } catch (e) {
    logger.error({
      error: e,
      message: 'Profiles.listAllUsers-error',
    })

    return { status: 'error', message: e }
  }
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
      error,
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
    const fields = ['email']

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
      error,
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
  await getAppSettings(null, null, ctx)

  const {
    vtex: { logger },
  } = ctx

  const { sessionData, sender }: any = ctx.vtex

  const skipError = params?.skipError ?? false

  if (!sessionData?.namespaces && !skipError) {
    logger.warn({
      message: `checkUserPermission-userNotAuthenticated`,
    })
    throw new Error('User not authenticated, make sure the query is private')
  }

  if (!sender && !skipError) {
    logger.warn({
      message: `checkUserPermission-senderNotFound`,
    })

    throw new Error('Sender not available, make sure the query is private')
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

  const authPermissions = await getRoleAndPermissionsByEmail({
    ctx,
    email: authEmail,
    module,
    skipError: true,
  })

  const profilePermissions =
    profileEmail && authEmail !== profileEmail
      ? await getRoleAndPermissionsByEmail({
          ctx,
          email: profileEmail,
          module,
          skipError: true,
        })
      : defaultResponse

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
    clients: { profileSystem },
    vtex: { logger },
  } = ctx

  const { sessionData }: any = ctx.vtex

  if (!sessionData?.namespaces) {
    logger.warn({
      message: `checkImpersonation-userNotAuthenticated`,
    })
    throw new Error('User not authenticated, make sure the query is private')
  }

  const profile = sessionData?.namespaces?.profile
  const sfp = sessionData?.namespaces['storefront-permissions']
  const authEmail =
    sessionData?.namespaces?.authentication?.storeUserEmail?.value

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
