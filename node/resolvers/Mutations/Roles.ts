/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { getUserByRole } from '../Queries/Users'
import { deleteUserProfile } from './Users'

const config: any = currentSchema('b2b_roles')

export const saveRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const { id, name, features } = params
    const ret: any = await masterdata
      .createOrUpdateEntireDocument({
        dataEntity: config.name,
        fields: { name, features },
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

    return { status: 'success', message: '', id: ret.DocumentId }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const checkUsers: any = await getUserByRole(_, { id: params.id }, ctx)

    if (checkUsers.length) {
      const ids = checkUsers.map((item: any) => {
        return item.id
      })

      await deleteUserProfile(_, { ids }, ctx)
    }

    await masterdata.deleteDocument({ dataEntity: config.name, id: params.id })

    return { status: 'success', message: '', id: params.id }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
