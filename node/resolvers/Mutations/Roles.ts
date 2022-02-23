/* eslint-disable @typescript-eslint/no-explicit-any */
import { Slugify, currentRoleNames, toHash, rolesVbaseId } from '../../utils'
import { groupByRole } from '../Queries/Features'
import { searchRoles } from '../Queries/Roles'

export const saveRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { vbase },
  } = ctx

  try {
    const { id, name, features } = params
    const locked = params.locked ?? false
    const data: any = { name, features, locked }

    if (params.slug) {
      data.slug = params.slug
    } else if (!id && !params.slug) {
      data.slug = Slugify(name)
    }

    const roles = await searchRoles(null, ctx)

    await vbase.saveJSON('b2b_roles', rolesVbaseId, [
      ...roles.filter((item) => item.slug !== data.slug),
      {
        id: data.slug,
        name,
        locked,
        slug: data.slug,
        features,
      },
    ])

    return { status: 'success', message: '', id: data.slug }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

const onlyModules = (obj: any) => {
  return obj.map(({ module }: any) => {
    return { module }
  })
}

export const syncRoles = async (ctx: Context) => {
  const newRoles: any = []
  // Get role names based on the location
  const roleNames = currentRoleNames(ctx.vtex.tenant?.locale)
  // List all features grouped by Role
  const groups = await groupByRole(ctx)

  // List all roles from MD
  const roles: any = await searchRoles(null, ctx)
  // Compare existing roles (MD) to save only differences

  groups?.forEach((role: any) => {
    const [slug] = Object.getOwnPropertyNames(role)

    let currRole: any = {}
    const roleIndex = roles.findIndex((o: any) => o.slug === slug)

    if (roleIndex === -1) {
      currRole = {
        name: roleNames[slug],
        features: role[slug],
        slug,
        locked: true,
      }
    } else if (
      toHash(onlyModules(role[slug])) !==
      toHash(onlyModules(roles[roleIndex].features))
    ) {
      // Compare features
      const currModules: any = roles[roleIndex].features

      const newModules = role[slug].filter((m: any) => {
        return (
          roles[roleIndex].features.findIndex(
            (i: any) => i.module === m.module
          ) === -1
        )
      })

      newModules.forEach((m: any) => {
        currModules.push(m)
      })

      currRole = {
        ...roles[roleIndex],
        features: currModules,
      }
    }

    if (currRole.name) {
      newRoles.push(currRole)
    }
  })

  const oldRoles = roles.filter((old: any) => {
    return newRoles.findIndex((n: any) => n.slug === old.slug) === -1
  })

  const mergedRoles = oldRoles.concat(newRoles)

  const promise: any = []

  mergedRoles.forEach((role: any) => {
    promise.push(saveRole(role.id ?? null, role, ctx))
  })

  return Promise.all(promise).then(() => mergedRoles)
}

export const deleteRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { vbase },
  } = ctx

  try {
    const roles = await searchRoles(null, ctx)

    await vbase.saveJSON(
      'b2b_roles',
      rolesVbaseId,
      roles.filter((item) => item.id !== params.id)
    )

    return { status: 'success', message: '', id: params.id }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
