import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_users')

export const saveUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx


  try {
    const {profileId, canImpersonate, name, email, id} = params

    await masterdata.createOrUpdateEntireDocument({dataEntity: config.name, fields: {profileId, canImpersonate, name, email}, id, schema: config.version})

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteUser = async (_: any, params: any, ctx: Context) => {
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
