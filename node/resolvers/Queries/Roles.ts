/* eslint-disable @typescript-eslint/no-explicit-any */
import { syncRoles } from '../Mutations/Roles'
import { currentRoleNames, currentSchema, rolesVbaseId } from '../../utils'
import { getUserByRole } from './Users'

const sorting = (a: any, b: any) => (a.name > b.name ? 1 : -1)
const config: any = currentSchema('b2b_roles')

const getDefaultRoles = (locale: string) => {
  const roleNames = currentRoleNames(locale)
  const values = []

  for (const slug in roleNames) {
    values.push({
      id: slug,
      name: roleNames[slug],
      locked: true,
      slug,
      features: [],
    })
  }

  return values.sort(sorting)
}

export const searchRoles = async (_: any, ctx: Context) => {
  const {
    clients: { vbase, masterdata },
  } = ctx

  try {
    const roles = (await vbase.getJSON('b2b_roles', rolesVbaseId)) as any[]

    roles.sort(sorting)

    return roles
  } catch (e) {
    if (e?.response?.status === 404) {
      const options: any = {
        dataEntity: config.name,
        fields: ['id', 'name', 'features', 'locked', 'slug'],
        schema: config.version,
        pagination: { page: 1, pageSize: 50 },
      }

      const roles = await masterdata.searchDocuments(options)

      return !roles || roles.length === 0
        ? getDefaultRoles(ctx.vtex.tenant?.locale ?? '')
        : roles
    }

    throw new Error(e)
  }
}

export const getRole = async (_: any, params: any, ctx: Context) => {
  const {
    vtex: { logger },
  } = ctx

  try {
    const { id, slug } = params

    const role: any = id
      ? (await searchRoles(null, ctx)).find((item: any) => item.id === id)
      : (await searchRoles(null, ctx)).find((item: any) => item.slug === slug)

    return role
  } catch (e) {
    logger.error({
      message: 'Roles.getRole',
      e,
    })

    return { status: 'error', message: e }
  }
}

export const hasUsers = async (_: any, params: any, ctx: Context) => {
  const role: any = await getRole(
    null,
    { id: params.id, slug: params.slug },
    ctx
  )

  if (role?.id) {
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
