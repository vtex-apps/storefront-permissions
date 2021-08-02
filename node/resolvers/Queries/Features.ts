/* eslint-disable @typescript-eslint/no-explicit-any */
const sanitizeFeatures = (settings: any) => {
  return settings.map((app: any) => {
    const [module] = app.declarer.split('@')
    const { name, features, roles } = app[module]

    return {
      module,
      name,
      features,
      roles,
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

export const listFeatures = async (ctx: Context) => {
  if (ctx.vtex?.settings?.dependenciesSettings) {
    const settingsFiles: any = sanitizeFeatures(
      ctx.vtex.settings.dependenciesSettings
    )

    return settingsFiles
  }

  return []
}

const extractRoles = (settings: any) => {
  const roles: any = {}

  settings.forEach((app: any) => {
    app.features?.forEach((feature: any) => {
      feature.roles?.forEach((role: string) => {
        roles[role] = true
      })
    })
  })

  return Object.getOwnPropertyNames(roles)
}

const featuresByRole = (settings: any, role: string) => {
  const features: any = []

  settings.forEach((app: any) => {
    app.features?.forEach((feature: any) => {
      feature.roles?.forEach((current: string) => {
        if (current === role) {
          const moduleIndex = features.findIndex((f: any) => {
            return f.module === app.module
          })

          if (moduleIndex === -1) {
            features.push({
              module: app.module,
              features: [feature.value],
            })
          } else {
            features[moduleIndex].features.push(feature.value)
          }
        }
      })
    })
  })

  return features
}

export const groupByRole = async (ctx: Context) => {
  const settings = await listFeatures(ctx)
  const roles = extractRoles(settings)
  const features: any = []

  roles.forEach((role: string) => {
    features.push({ [role]: featuresByRole(settings, role) })
  })

  return features
}
