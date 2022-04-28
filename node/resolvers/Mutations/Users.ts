/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'

const config: any = currentSchema('b2b_users')

const addUserToMasterdata = async ({ masterdata, params }: any) => {
  const newUser = await masterdata
    .createDocument({
      dataEntity: 'CL',
      fields: {
        email: params.email,
        firstName: params.name,
      },
    })
    .then((r: any) => {
      return r
    })
    .catch((err: any) => {
      if (err.response?.data?.Message === 'duplicated entry') {
        return masterdata
          .searchDocuments({
            dataEntity: 'CL',
            fields: ['id'],
            pagination: {
              page: 1,
              pageSize: 1,
            },
            where: `email=${params.email}`,
          })
          .then((res: any) => {
            return { DocumentId: res[0].id }
          })
      }

      throw err
    })

  return newUser.DocumentId
}

const getUser = async ({ masterdata, params }: any) => {
  return masterdata
    .searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'email', 'orgId'],
      schema: config.version,
      pagination: {
        page: 1,
        pageSize: 1,
      },
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

  const ret = await masterdata
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
    .then((r: any) => {
      return r
    })
    .catch((err: any) => {
      if (err.response.status < 400) {
        return {
          DocumentId: id,
        }
      }

      throw err
    })

  if (ret.DocumentId) {
    await vbase.saveJSON('b2b_users', email, {
      canImpersonate,
      clId,
      costId,
      email,
      id: ret.DocumentId,
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
    const userExists = await getUser({ masterdata, params })

    if (userExists) {
      throw new Error(
        `User with email ${params.email} already exists, id="${userExists.id}"`
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
  } catch (err) {
    logger.error(err)

    return { status: 'error', message: err }
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
  } catch (e) {
    logger.error({ message: 'Error saving user', error: e })

    return { status: 'error', message: e }
  }
}

export const deleteUserProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const { ids } = params

  try {
    const ret: any = []

    ids.forEach((id: string) => {
      ret.push(
        masterdata.createOrUpdatePartialDocument({
          dataEntity: config.name,
          fields: { roleId: '' },
          id,
          schema: config.version,
        })
      )
    })

    Promise.all(ret)
      .then((r: any) => {
        return r
      })
      .catch((err: any) => {
        if (err.response.status >= 400) {
          throw err
        }
      })

    return { status: 'success', message: '', id: ret.DocumentId }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
  } = ctx

  const { id, email } = params

  try {
    await vbase.deleteFile('b2b_users', email).catch(() => null)

    await masterdata.deleteDocument({
      dataEntity: config.name,
      id,
    })

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const impersonateUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { session },
    cookies,
    request,
  } = ctx

  const { userId } = params

  const sessionCookie =
    cookies.get('vtex_session') ?? request.header?.sessiontoken

  try {
    await session.updateSession('impersonate', userId, [], sessionCookie)

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
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
