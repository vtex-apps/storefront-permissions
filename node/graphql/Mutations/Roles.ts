import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_roles')

export const saveRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx


  try {
    const {id, role} = params
    await masterdata.createOrUpdateEntireDocument({dataEntity: config.name, fields: {role}, id, schema: config.version})

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteRole = async (_: any, params: any, ctx: Context) => {
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
