/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { removeVersionFromAppId } from '@vtex/api'

import { currentSchema } from '../../utils'
import { getRole } from './Roles'
import { getAppSettings } from './Settings'

const config: any = currentSchema('b2b_users')

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

export const listUsers = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  let res: any = []

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
    })

    return res
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const checkUserPermission = async (_: any, __: any, ctx: Context) => {
  await getAppSettings(null, null, ctx)

  const { sessionData, sender }: any = ctx.vtex

  console.log('sessionData =>', sessionData)

  if (!sessionData?.namespaces) {
    throw new Error('User not authenticated')
  }

  if (!sender) {
    throw new Error('Sender not available')
  }

  const module = removeVersionFromAppId(sender)
  const user = sessionData?.namespaces?.profile

  console.log('Module =>', module)
  console.log('User =>', user)

  if (!user?.email?.value) {
    throw new Error('User session not available')
  }

  const userData: any = await getUserByEmail(
    _,
    { email: user.email.value },
    ctx
  )

  if (!userData.length) {
    throw new Error('User not found')
  }

  const userRole: any = await getRole(_, { id: userData[0].roleId }, ctx)

  if (!userRole) {
    throw new Error('Role not found')
  }

  const currentModule = userRole.features.find((feature: any) => {
    return feature.module === module
  })

  if (!currentModule && module !== 'vtex.storefront-permissions-ui') {
    throw new Error(`Role not found for module ${module}`)
  }

  console.log('viewUserPermissions =>', {
    role: userRole,
    permissions: currentModule?.features ?? [],
  })

  return {
    role: userRole,
    permissions: currentModule?.features ?? [],
  }
}
