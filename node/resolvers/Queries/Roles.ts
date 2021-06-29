/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'

const config: any = currentSchema('b2b_roles')

export const getRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
  } = ctx

  try {
    const { id } = params
    const cachedRole = await vbase.getJSON('b2b_roles', id).catch(() => null)

    if (cachedRole) {
      return cachedRole
    }

    const role = await masterdata.getDocument({
      dataEntity: config.name,
      id,
      fields: ['id', 'name', 'features'],
    })

    return role
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const listRoles = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const roles = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'name', 'features'],
      schema: config.version,
      pagination: { page: 1, pageSize: 50 },
    })

    return roles
  } catch (e) {
    return { status: 'error', message: e }
  }
}
