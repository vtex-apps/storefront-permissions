import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_features')

export const getFeatures = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const {id} = params
    return await masterdata.getDocument({dataEntity: config.name, id, fields: ['id','module','features','hash']})
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const getFeaturesByModule = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const {module} = params

  try {
    return await masterdata.searchDocuments({dataEntity: config.name, fields: ['id','module','features','hash'], schema: config.version, pagination: {page: 1, pageSize: 50}, where: `module=${module}`})

  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const listFeatures = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    return await masterdata.searchDocuments({dataEntity: config.name, fields: ['id','module','features','hash'], schema: config.version, pagination: {page: 1, pageSize: 50}})

  } catch (e) {
    return { status: 'error', message: e }
  }
}
