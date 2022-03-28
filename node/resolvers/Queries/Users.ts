/* eslint-disable @typescript-eslint/no-explicit-any */
import { removeVersionFromAppId } from '@vtex/api'

import { currentSchema } from '../../utils'
import { getRole } from './Roles'
import { getAppSettings } from './Settings'

const config: any = currentSchema('b2b_users')

export const getUserById = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterdata.getDocument({
      dataEntity: 'CL',
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

export const getUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const { id } = params

    const cl: any = await masterdata.getDocument({
      dataEntity: 'CL',
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

    const ret = user.length
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

    return ret
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

    const ret = await masterdata
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
      
    return ret
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

export const checkUserPermission = async (
  _: any,
  params: any,
  ctx: Context
) => {
  await getAppSettings(null, null, ctx)

  const { sessionData, sender }: any = ctx.vtex

  const skipError = params?.skipError ?? false

  if (!sessionData?.namespaces && !skipError) {
    throw new Error('User not authenticated, make sure the query is private')
  }

  if (!sender && !skipError) {
    throw new Error('Sender not available, make sure the query is private')
  }

  const { email } = sessionData?.namespaces?.profile || {}

  let ret = null

  if (email?.value && sender) {
    const module = removeVersionFromAppId(sender)

    const userData: any = await getUserByEmail(
      _,
      { email: email?.value },
      ctx
    )

    if (!userData.length && !skipError) {
      throw new Error('User not found')
    }

    if (userData.length) {
      const userRole: any = await getRole(_, { id: userData[0].roleId }, ctx)

      if (!userRole && !skipError) {
        throw new Error('Role not found')
      }

      if (userRole) {
        const currentModule = userRole.features?.find((feature: any) => {
          return feature.module === module
        })

        ret = {
          role: userRole,
          permissions: currentModule?.features ?? [],
        }
      }
    }
  }

  return ret
}

export const checkImpersonation = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { profileSystem },
  } = ctx

  const { sessionData }: any = ctx.vtex

  if (!sessionData?.namespaces) {
    throw new Error('User not authenticated, make sure the query is private')
  }

  const profile = sessionData?.namespaces?.profile
  const sfp = sessionData?.namespaces['storefront-permissions']

  let ret = null

  if (
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
