/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { getUser } from '../Queries/Users'

const config: any = currentSchema('b2b_users')

export const saveUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm, vbase },
  } = ctx

  try {
    const { roleId, canImpersonate, name, email, userId, id } = params
    let _userId = userId

    if (canImpersonate) {
      const saveLM: any = await lm.saveUser(name, email).catch((err) => {
        throw new Error(err)
      })

      _userId = saveLM.userId
    } else if (userId) {
      await lm.deleteUser(userId).catch((err) => {
        throw new Error(err)
      })
    }

    const ret = await masterdata
      .createOrUpdateEntireDocument({
        dataEntity: config.name,
        fields: { roleId, userId: _userId, canImpersonate, name, email },
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
        userId: _userId,
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

  const { id, userId } = params

  try {
    const user: any = await getUser(_, { id }, ctx)

    await vbase.deleteFile('b2b_users', user.email)

    await masterdata.deleteDocument({
      dataEntity: config.name,
      id,
    })
    if (userId) {
      await lm.deleteUser(userId)
    }

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
