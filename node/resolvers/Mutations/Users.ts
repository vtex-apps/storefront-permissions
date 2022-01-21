/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'

const config: any = currentSchema('b2b_users')

export const saveUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm, vbase },
    vtex: { logger },
  } = ctx

  try {
    // check if new user already exists in CL and create profile if not
    if (!params.clId) {
      const newUser = await masterdata
        .createDocument({
          dataEntity: 'CL',
          fields: {
            firstName: params.name,
            email: params.email,
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
                where: `email=${params.email}`,
                pagination: {
                  page: 1,
                  pageSize: 1,
                },
              })
              .then((res: any) => {
                return { DocumentId: res[0].id }
              })
          }

          logger.error(err)
          throw err
        })

      params.clId = newUser.DocumentId
    }

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

    let UserId = userId
    let mdId = id

    if (canImpersonate) {
      await lm.saveUser(name, email).catch((err) => {
        throw new Error(err)
      })
      const user = await lm.getUserIdByEmail(email)

      UserId = user ?? userId
    } else {
      await lm.deleteUser(userId).catch((err) => {
        throw new Error(err)
      })
    }

    // check if new user's email already exists in storefront-permissions MD
    if (!mdId) {
      mdId = await masterdata
        .searchDocuments({
          dataEntity: config.name,
          fields: ['id'],
          schema: config.version,
          pagination: { page: 1, pageSize: 90 },
          where: `email=${email}`,
        })
        .then((r: any) => {
          return r?.length ? r[0].id : null
        })
        .catch(() => {
          return null
        })
    }

    const ret = await masterdata
      .createOrUpdateEntireDocument({
        dataEntity: config.name,
        fields: {
          roleId,
          userId: UserId,
          clId,
          orgId,
          costId,
          canImpersonate,
          name,
          email,
        },
        id: mdId,
        schema: config.version,
      })
      .then((r: any) => {
        return r
      })
      .catch((err) => {
        if (err.response.status < 400) {
          return {
            DocumentId: id,
          }
        }

        throw err
      })

    if (ret.DocumentId) {
      await vbase.saveJSON('b2b_users', email, {
        id: ret.DocumentId,
        roleId,
        userId,
        clId,
        orgId,
        costId,
        canImpersonate,
        name,
        email,
      })
    }

    return { status: 'success', message: '', id: ret.DocumentId }
  } catch (e) {
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
    clients: { masterdata, lm, vbase },
  } = ctx

  const { id, userId, email } = params

  try {
    await vbase.deleteFile('b2b_users', email).catch(() => null)

    await masterdata.deleteDocument({
      dataEntity: config.name,
      id,
    })

    if (userId) {
      await lm.deleteUser(userId)
    } else {
      const user = await lm.getUserIdByEmail(email)

      if (user) {
        await lm.deleteUser(user)
      }
    }

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const impersonateUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { session },
    cookies,
  } = ctx

  const { userId } = params

  const sessionCookie = cookies.get('vtex_session')

  try {
    await session.updateSession('impersonate', userId, [], sessionCookie)

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
