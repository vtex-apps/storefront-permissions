import {currentSchema} from '../../utils'
import {getProfileByRole} from '../Queries/Profiles'
const config: any = currentSchema('b2b_profiles')

export const saveProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx


  try {
    const {id, roleId, features, scoped} = params
    const check: any = getProfileByRole(_, {roleId}, ctx)
    if(!check.length) {
      const ret = await masterdata.createOrUpdateEntireDocument({dataEntity: config.name, fields: {roleId, features, scoped}, id, schema: config.version})
      return { status: 'success', message: '', id: ret.DocumentId }
    } else {
      return { status: 'error', message: `There's a profile already associated to this Role`}
    }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    await masterdata.deleteDocument({dataEntity: config.name, id: params.id})

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
