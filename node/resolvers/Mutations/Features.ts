/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentSchema, toHash } from '../../utils'

const config: any = currentSchema('b2b_features')

export const saveFeatures = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const { id, features, module } = params
    const hash = toHash({ module, features })

    await masterdata.createOrUpdateEntireDocument({
      dataEntity: config.name,
      fields: { module, features, hash },
      id,
      schema: config.version,
    })

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const checkAddFeatures = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const { features, module } = params
    const hash = toHash({ module, features })
    const check = await masterdata.searchDocuments({
      dataEntity: config.name,
      fields: ['id'],
      where: `hash=${hash}`,
      pagination: { pageSize: 1, page: 1 },
    })

    if (!check.length) {
      saveFeatures(_, params, ctx)
    }

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteFeatures = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    await masterdata.deleteDocument({ dataEntity: config.name, id: params.id })

    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
