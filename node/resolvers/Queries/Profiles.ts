/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { listRoles } from './Roles'

const config: any = currentSchema('b2b_profiles')

export const getProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const { id } = params

    return await masterdata.getDocument({
      dataEntity: config.name,
      id,
      fields: ['id', 'roleId', 'features'],
    })
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const getProfileByRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const { roleId } = params

  try {
    const [ret] = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'roleId', 'features'],
      schema: config.version,
      pagination: { page: 1, pageSize: 50 },
      where: `roleId=${roleId}`,
    })

    return ret
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const listProfiles = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const roles: any = await listRoles(_, __, ctx)

    const profiles: any = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'roleId', 'features', 'scoped'],
      schema: config.version,
      pagination: { page: 1, pageSize: 50 },
    })

    const ret = profiles.map((profile: any) => {
      return {
        ...profile,
        name: roles.find((role: any) => {
          return role.id === profile.roleId
        })?.name,
      }
    })

    return ret
  } catch (e) {
    return { status: 'error', message: e }
  }
}
