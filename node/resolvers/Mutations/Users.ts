/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { CUSTOMER_SCHEMA_NAME } from '../../utils/constants'

const config: any = currentSchema('b2b_users')

const addUserToMasterdata = async ({ masterdata, params }: any) => {
  const { DocumentId } = await masterdata
    .createDocument({
      dataEntity: CUSTOMER_SCHEMA_NAME,
      fields: {
        email: params.email,
        firstName: params.name,
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
            where: `email=${params.email}`,
          })
          .then((res: [{ id: string }]) => {
            return { DocumentId: res[0].id }
          })
      }

      throw error
    })

  return DocumentId
}

const getUser = async ({ masterdata, params }: any) => {
  return masterdata
    .searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'email', 'orgId'],
      pagination: {
        page: 1,
        pageSize: 1,
      },
      schema: config.version,
      where: `email=${params.email}`,
    })
    .then((res: any) => {
      return res.length > 0 ? res[0] : null
    })
    .catch(() => null)
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

  const UserId = userId
  let mdId = id

  // check if new user's email already exists in storefront-permissions MD
  if (!mdId) {
    const userExists = await getUser({ masterdata, params: { email } })

    if (userExists) {
      mdId = userExists.id
    }
  }

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
        userId: UserId,
      },
      id: mdId,
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

  const throwError = (error: string) => {
    throw new Error(error)
  }

  try {
    const userExists = await getUser({ masterdata, params })

    if (userExists) {
      if (userExists.orgId === params.orgId) {
        throwError(
          `User with email ${params.email} already exists in the organization, id="${userExists.id}"`
        )
      }

      throwError(
        `User with email ${params.email} already exists in another organization, id="${userExists.id}"`
      )
    }

    const cId = await addUserToMasterdata({ masterdata, params })

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
    cookies,
    request,
    vtex: { logger },
  } = ctx

  const { userId } = params

  const sessionCookie =
    cookies.get('vtex_session') ?? request.header?.sessiontoken

  try {
    await session.updateSession('impersonate', userId, [], sessionCookie)

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
