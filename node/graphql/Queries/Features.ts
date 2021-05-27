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

const sanitizeSettings = (settings: any[]) => {
  return settings.reduce((acc, curr) => {
    const [configurator] = curr.declarer?.split('@')
    if (!curr[configurator]) { return acc }
    const singleSetting = curr[configurator]
    return { ...acc, ...singleSetting }
  }, {})
}

export const listFeatures = async (_: any, __: any, ctx: Context) => {
  console.log('ctx.vtex.settings =>', ctx.vtex.settings)
  if (ctx.vtex.settings) {
    const settingsFiles = sanitizeSettings(ctx.vtex.settings)
    console.log('settingsFiles =>', settingsFiles)
    return settingsFiles
  }
  return []
}
