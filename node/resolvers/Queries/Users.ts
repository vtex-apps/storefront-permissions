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
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterdata.getDocument({
      dataEntity: CUSTOMER_SCHEMA_NAME,
      id,
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
    })

    return cl ?? null
  } catch (e) {
    return { status: 'error', message: e }
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
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterdata.getDocument({
      dataEntity: CUSTOMER_SCHEMA_NAME,
      id,
      fields: ['firstName', 'lastName', 'email', 'userId'],
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
      schema: config.version,
      pagination: { page: 1, pageSize: 90 },
      where: `clId=${id}`,
    })

    return user.length
      ? {
          ...user[0],
          name: `${cl.firstName} ${cl.lastName}`,
          email: cl.email,
        }
      : {
          roleId: null,
          userId: cl.userId,
          clId: id,
          canImpersonate: false,
          name: `${cl.firstName} ${cl.lastName}`,
          email: cl.email,
        }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const getUserByRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
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
      schema: config.version,
      pagination: { page: 1, pageSize: 90 },
      where: `roleId=${id}`,
    })
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const getUserByEmail = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
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
        schema: config.version,
        pagination: { page: 1, pageSize: 50 },
        where: `email=${email}`,
      })
      .catch(() => [])
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const listAllUsers = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
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
      schema: config.version,
      pagination: { page: 1, pageSize: 50 },
      ...(where && { where }),
    })

    return res
  } catch (e) {
    return { status: 'error', message: e }
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
    res = await masterdata.searchDocumentsWithPaginationInfo({
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

    return res
  } catch (e) {
    return { status: 'error', message: e }
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

  let ret = {
    role: {
      id: '',
      name: '',
      slug: '',
    },
    permissions: [],
  }

  if (!email) return ret

  const userData: any = await getUserByEmail(null, { email }, ctx)

  if (!userData.length && !skipError) {
    logger.warn({
      message: `getRoleAndPermissionsByEmail-userNotFound`,
      email,
    })
    throw new Error('User not found')
  }

  if (!userData.length) return ret

  const userRole: any = await getRole(null, { id: userData[0].roleId }, ctx)

  if (!userRole && !skipError) {
    logger.warn({
      message: `getRoleAndPermissionsByEmail-roleNotFound`,
      roleId: userData[0].roleId,
    })
    throw new Error('Role not found')
  }

  if (!userRole) return ret

  const currentModule = userRole.features?.find((feature: any) => {
    return feature.module === module
  })

  ret = {
    role: {
      id: userRole.id,
      name: userRole.name,
      slug: userRole.slug,
    },
    permissions: currentModule?.features || [],
  }

  return ret
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

  let ret = {
    role: {
      id: '',
      name: '',
      slug: '',
    },
    permissions: [],
  }

  if (!sender) return ret

  const module = removeVersionFromAppId(sender)

  const authPermissions = await getRoleAndPermissionsByEmail({
    email: authEmail,
    module,
    skipError: true,
    ctx,
  })

  let profilePermissions = ret

  if (profileEmail && authEmail !== profileEmail) {
    profilePermissions = await getRoleAndPermissionsByEmail({
      email: profileEmail,
      module,
      skipError: true,
      ctx,
    })
  }

  ret = {
    role: authPermissions.role.id
      ? authPermissions.role
      : profilePermissions.role,
    permissions: [
      ...new Set([
        ...authPermissions.permissions,
        ...profilePermissions.permissions,
      ]),
    ],
  }

  return ret
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

  let ret = null

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
      ret = { error: 'User not found' }
    } else {
      ret = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        userId: userData.userId,
      }
    }
  }

  return ret
}
