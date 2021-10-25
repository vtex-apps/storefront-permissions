/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'

const config: any = currentSchema('b2b_users')

export const saveUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm, vbase },
    vtex: { logger },
  } = ctx

  try {
    if (!params.id) {
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
          logger.error(err)
          throw err
        })

      params.id = newUser.DocumentId
      params.clId = newUser.DocumentId
      console.log('newUser =>', newUser)
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
        id,
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
