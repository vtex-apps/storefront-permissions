/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { deleteRole, saveRole } from './Mutations/Roles'
import { sessionWatcher } from './Mutations/Settings'
import {
  addUser,
  deleteUser,
  impersonateUser,
  saveUser,
  updateUser,
} from './Mutations/Users'
import { getFeaturesByModule, listFeatures } from './Queries/Features'
import { getRole, hasUsers, listRoles } from './Queries/Roles'
import { getAppSettings, getSessionWatcher } from './Queries/Settings'
import {
  checkImpersonation,
  checkUserPermission,
  getUser,
  getUserByEmail,
  listUsers,
} from './Queries/Users'
import { Routes } from './Routes'

export const resolvers = {
  Mutation: {
    addUser,
    deleteRole,
    deleteUser,
    impersonateUser,
    saveRole,
    saveUser,
    sessionWatcher,
    updateUser,
  },
  Query: {
    checkImpersonation,
    checkUserPermission,
    getAppSettings,
    getFeaturesByModule,
    getRole,
    getSessionWatcher,
    getUser,
    getUserByEmail,
    hasUsers,
    listFeatures,
    listRoles,
    listUsers,
  },
  Routes,
}
