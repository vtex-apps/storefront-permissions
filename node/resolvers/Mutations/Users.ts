/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserInputError } from '@vtex/api'

import { currentSchema } from '../../utils'
import { CUSTOMER_SCHEMA_NAME } from '../../utils/constants'
import type { ChangeTeamParams } from '../../utils/metrics/changeTeam'
import { sendChangeTeamMetric } from '../../utils/metrics/changeTeam'
import {
  getAllUsersByEmail,
  getOrganizationsByEmail,
  getUserByEmailOrgIdAndCostId,
} from '../Queries/Users'

const config: any = currentSchema('b2b_users')

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

  const userExists = await masterdata.searchDocuments({
    dataEntity: CUSTOMER_SCHEMA_NAME,
    fields: ['id'],
    pagination: {
      page: 1,
      pageSize: 1,
    },
    where: `email=${email}`,
  })

  if (userExists.length) {
    throw new UserInputError(`OrganizationUserAlreadyExists`)
  }

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

const createPermission = async ({ masterdata, vbase, params }: any) => {
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

  const { DocumentId } = await masterdata
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

  if (DocumentId) {
    await vbase.saveJSON('b2b_users', email, {
      canImpersonate,
      clId,
      costId,
      email,
      id: DocumentId,
      name,
      orgId,
      roleId,
      userId,
    })
  }
}

export const addUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm, vbase },
    vtex: { logger },
  } = ctx

  try {
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
      throw new Error(
        `User with email ${params.email} already exists in the organization and cost center`
      )
    }

    await createPermission({
      lm,
      masterdata,
      params: {
        ...params,
        clId: cId,
      },
      vbase,
    })

    return { status: 'success', message: '', id: cId }
  } catch (error) {
    logger.error({
      error,
      message: 'addUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const updateUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm, vbase },
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
      vbase,
    })

    return { status: 'success', message: '', id: params.clId }
  } catch (error) {
    logger.error({
      error,
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
          error,
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
      error,
      message: 'deleteUserProfile.error',
    })

    return { status: 'error', message: error }
  }
}

export const deleteUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
    vtex: { logger },
  } = ctx

  const { id, email } = params

  try {
    await vbase.deleteFile('b2b_users', email).catch(() => null)

    await masterdata.deleteDocument({
      dataEntity: config.name,
      id,
    })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error,
      message: 'deleteUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const impersonateUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { session },
    vtex: { logger, sessionToken },
  } = ctx

  const { userId } = params

  try {
    await session.updateSession('impersonate', userId, [], sessionToken)

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error,
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
      error,
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
      error,
      message: 'addCostCenterToUser.error',
    })

    return { status: 'error', message: error }
  }
}

export const setActiveUserByOrganization = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    clients: { masterdata, session },
    vtex: { logger, adminUserAuthToken, sessionToken },
  } = ctx

  let userId = null

  if (adminUserAuthToken) {
    userId = params.userId
  } else {
    const sessionData = await session
      .getSession(sessionToken as string, ['*'])
      .then((currentSession: any) => {
        return currentSession.sessionData
      })
      .catch((error: any) => {
        logger.error({
          error,
          message: 'orders-getSession-error',
        })

        return null
      })

    const currentUserEmail =
      sessionData?.namespaces?.profile?.email?.value ?? params.email

    const userByEmail = (await getUserByEmailOrgIdAndCostId(
      masterdata,
      {
        email: currentUserEmail,
        costId: params.costId,
        orgId: params.orgId,
      },
      ctx
    )) as any

    userId = userByEmail
      ? userByEmail.id
      : sessionData?.namespaces?.['storefront-permissions']?.userId?.value
  }

  const user = await getUser({ masterdata, params: { userId } })

  if (!user) {
    throw new Error('User not found')
  }

  await updateUserFields({
    fields: { ...user, active: true },
    id: userId,
    masterdata,
  })

  const users = await getAllUsersByEmail(_, { email: user.email }, ctx)

  try {
    const promises = users.map(async (userSecondary: any) => {
      if (userSecondary.id !== user.id) {
        await updateUserFields({
          fields: {
            ...userSecondary,
            active: false,
          },
          id: userSecondary.id,
          masterdata,
        })
      }
    })

    await Promise.all(promises)
  } catch (error) {
    logger.error({
      error,
      message: 'setActiveUserById.error',
    })
  }
}

export const setCurrentOrganization = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const {
    cookies,
    request,
    vtex: { logger },
    clients: { session },
  } = ctx

  const { sessionData } = ctx.vtex as any

  const { orgId, costId } = params

  const {
    email: { value: email },
  } = sessionData.namespaces.profile

  const organizationList = (await getOrganizationsByEmail(
    _,
    { email },
    ctx
  )) as any[]

  const user = organizationList.find((orgUser: any) => {
    return orgUser.orgId === orgId && orgUser.costId === costId
  })

  if (!user) {
    const error =
      'This organization/cost center is not allowed to this current user'

    logger.error({
      error,
      message: 'updateCurrentOrganization.error',
    })

    return { status: 'error', message: error }
  }

  const sessionCookie =
    cookies.get('vtex_session') ?? request.header?.sessiontoken

  try {
    await session.updateSession('', null, [], sessionCookie)
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

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error,
      message: 'updateCurrentOrganization.error',
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
    clients: { session },
  } = ctx

  const sessionCookie =
    cookies.get('vtex_session') ?? request.header?.sessiontoken

  try {
    await session.updateSession('removeB2B', enabled, [], sessionCookie)

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error,
      message: 'removeB2BSessionData.error',
    })

    return { status: 'error', message: error }
  }
}
