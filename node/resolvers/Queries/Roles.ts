/* eslint-disable @typescript-eslint/no-explicit-any */
// import { currentSchema } from '../../utils'
import { syncRoles } from '../Mutations/Roles'
import { rolesVbaseId } from '../../utils'
import { getUserByRole } from './Users'

// const config: any = currentSchema('b2b_roles')

export const searchRoles = async (_: any, ctx: Context) => {
  const {
    clients: { vbase },
  } = ctx

  try {
    const roles = (await vbase.getJSON('b2b_roles', rolesVbaseId)) as any[]

    roles.sort((a, b) => {
      return a.name > b.name ? 1 : -1
    })

    return roles
  } catch (e) {
    if (e?.response?.status === 404) {
      return []
    }

    throw new Error(e)
  }
}

export const getRole = async (_: any, params: any, ctx: Context) => {
  try {
    const { id } = params

    const role: any = (await searchRoles(null, ctx)).find(
      (item: any) => item.id === id
    )

    return role
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const hasUsers = async (_: any, params: any, ctx: Context) => {
  const role: any = await getRole(null, { id: params.slug || params.id }, ctx)

  if (role) {
    const usersByRole: any = await getUserByRole(_, { id: role.id }, ctx)

    return usersByRole.length > 0
  }

  return false
}

export const listRoles = async (_: any, __: any, ctx: Context) => {
  try {
    await syncRoles(ctx)

    return await searchRoles(null, ctx)
  } catch (e) {
    return { status: 'error', message: e }
  }
}
