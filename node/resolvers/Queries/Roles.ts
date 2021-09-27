/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { syncRoles } from '../Mutations/Roles'
import { getUserByRole } from './Users'
import { groupByRole } from './Features'

const config: any = currentSchema('b2b_roles')

export const getRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, vbase },
  } = ctx

  try {
    const { id } = params
    let role: any = await vbase.getJSON('b2b_roles', id).catch(() => null)

    if (!role) {
      role = await masterdata.getDocument({
        dataEntity: config.name,
        id,
        fields: ['id', 'name', 'features', 'locked', 'slug'],
      })
    }

    let featureByRole = await groupByRole(ctx)

    featureByRole = featureByRole?.filter((currRole: any) => {
      return !!currRole[role.slug]
    })

    if (featureByRole?.length) {
      role.features = featureByRole[0][role.slug]
    }

    return role
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const searchRoles = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const options: any = {
    dataEntity: config.name,
    fields: ['id', 'name', 'features', 'locked', 'slug'],
    schema: config.version,
    pagination: { page: 1, pageSize: 50 },
  }

  if (params?.query) {
    options.where = params?.query
  }

  const roles = await masterdata.searchDocuments(options)

  return roles
}

export const hasUsers = async (_: any, params: any, ctx: Context) => {
  const roles: any = await searchRoles(_, { query: `slug=${params.slug}` }, ctx)

  if (roles.length) {
    const usersByRole: any = await getUserByRole(_, { id: roles[0].id }, ctx)

    return usersByRole.length > 0
  }

  return false
}

export const listRoles = async (_: any, __: any, ctx: Context) => {
  try {
    await syncRoles(ctx)

    const roles = await searchRoles(_, null, ctx)

    return roles
  } catch (e) {
    return { status: 'error', message: e }
  }
}
