/* eslint-disable @typescript-eslint/no-explicit-any */
const sanitizeFeatures = (settings: any) => {
  return settings.map((app: any) => {
    const [module] = app.declarer.split('@')
    const { name, features } = app[module]

    return {
      module,
      name,
      features,
    }
  })
}

export const getFeaturesByModule = async (
  _: any,
  params: any,
  ctx: Context
) => {
  const { module } = params

  if (ctx.vtex?.settings?.dependenciesSettings) {
    const settingsFiles: any = sanitizeFeatures(
      ctx.vtex.settings.dependenciesSettings
    )

    return settingsFiles.find((app: any) => {
      return app.module === module
    })
  }

  return null
}

export const listFeatures = async (_: any, __: any, ctx: Context) => {
  if (ctx.vtex?.settings?.dependenciesSettings) {
    const settingsFiles: any = sanitizeFeatures(
      ctx.vtex.settings.dependenciesSettings
    )

    return settingsFiles
  }

  return []
}
