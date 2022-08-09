/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema } from '../../utils'
import { getProfileByRole } from '../Queries/Profiles'

const config: any = currentSchema('b2b_profiles')

export const saveProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    const { id, roleId, features } = params
    const check: any = getProfileByRole(_, { roleId }, ctx)

    if (!check.length) {
      const ret = await masterdata.createOrUpdateEntireDocument({
        dataEntity: config.name,
        fields: { roleId, features },
        id,
        schema: config.version,
      })

      return { status: 'success', message: '', id: ret.DocumentId }
    }

    return {
      message: `There's a profile already associated to this Role`,
      status: 'error',
    }
  } catch (error) {
    logger.error({
      error,
      message: 'Profiles.saveProfile-error',
    })

    return { status: 'error', message: error }
  }
}

export const deleteProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
    vtex: { logger },
  } = ctx

  try {
    await masterdata.deleteDocument({ dataEntity: config.name, id: params.id })

    return { status: 'success', message: '' }
  } catch (error) {
    logger.error({
      error,
      message: 'Profiles.deleteProfile-error',
    })

    return { status: 'error', message: error }
  }
}
