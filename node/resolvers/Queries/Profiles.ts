/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { listRoles } from './Roles'

const config: any = currentSchema('b2b_profiles')

export const getProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const { id } = params

    return await masterdata.getDocument({
      dataEntity: config.name,
      fields: ['id', 'roleId', 'features'],
      id,
    })
  } catch (error) {
    logger.error({
      error,
      message: 'Profiles.getProfile-error',
    })

    return { status: 'error', message: error }
  }
}

export const getProfileByRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  const { roleId } = params

  try {
    const [profile] = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'roleId', 'features'],
      pagination: { page: 1, pageSize: 50 },
      schema: config.version,
      where: `roleId=${roleId}`,
    })

    return profile
  } catch (error) {
    logger.error({
      error,
      message: 'Profiles.getProfileByRole-error',
    })

    return { status: 'error', message: error }
  }
}

export const listProfiles = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const roles: any = await listRoles(_, __, ctx)

    const profiles: any = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: ['id', 'roleId', 'features', 'scoped'],
      pagination: { page: 1, pageSize: 50 },
      schema: config.version,
    })

    return profiles.map((profile: any) => {
      return {
        ...profile,
        name: roles.find((role: any) => {
          return role.id === profile.roleId
        })?.name,
      }
    })
  } catch (error) {
    logger.error({
      error,
      message: 'Profiles.listProfiles-error',
    })

    return { status: 'error', message: error }
  }
}
