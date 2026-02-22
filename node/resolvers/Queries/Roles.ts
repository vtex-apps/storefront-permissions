/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentRoleNames, currentSchema } from '../../utils'
import { ROLES_VBASE_ID } from '../../utils/constants'
import { getUserByRole } from './Users'

const sorting = (a: any, b: any) => (a.name > b.name ? 1 : -1)
const config: any = currentSchema('b2b_roles')

const getDefaultRoles = (locale: string) => {
  const roleNames = currentRoleNames(locale)
  const values = [] as Array<{
    features: string[]
    id: string
    locked: boolean
    name: string
    slug: string
  }>

  Object.keys(roleNames).forEach((slug) => {
    values.push({
      features: [],
      id: slug,
      locked: true,
      name: roleNames[slug],
      slug,
    })
  })

  return values.sort(sorting)
}

export const searchRoles = async (_: any, ctx: Context) => {
  const {
    clients: { vbase, masterdata },
  } = ctx

  try {
    const roles: any[] = await vbase.getJSON('b2b_roles', ROLES_VBASE_ID)

    roles.sort(sorting)

    return roles
  } catch (error) {
    if (error?.response?.status === 404) {
      const options: any = {
        dataEntity: config.name,
        fields: ['id', 'name', 'features', 'locked', 'slug'],
        pagination: { page: 1, pageSize: 50 },
        schema: config.version,
      }

      const roles = await masterdata.searchDocuments(options)

      return !roles || roles.length === 0
        ? getDefaultRoles(ctx.vtex.tenant?.locale ?? '')
        : roles
    }

    throw new Error(error)
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
  } catch (error) {
    logger.error({
      error,
      message: 'Roles.getRole',
    })

    return { status: 'error', message: error }
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
  const {
    vtex: { logger },
  } = ctx

  try {
    return await searchRoles(null, ctx)
  } catch (e) {
    logger.error({
      error: e,
      message: 'Roles.listRoles',
    })

    return { status: 'error', message: e }
  }
}
