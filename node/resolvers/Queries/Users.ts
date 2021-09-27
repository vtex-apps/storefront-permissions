/* eslint-disable no-console */
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

  const user = sessionData?.namespaces?.profile

  let ret = null

  if (user?.email?.value && sender) {
    const module = removeVersionFromAppId(sender)

    const userData: any = await getUserByEmail(
      _,
      { email: user.email.value },
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

        if (
          !currentModule &&
          module !== 'vtex.storefront-permissions-ui' &&
          !skipError
        ) {
          throw new Error(`Role not found for module ${module}`)
        }

        ret = {
          role: userRole,
          permissions: currentModule?.features ?? [],
        }
      }
    }
  }

  return ret
}
