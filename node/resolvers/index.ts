/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { deleteRole, saveRole } from './Mutations/Roles'
import { sessionWatcher } from './Mutations/Settings'
import {
  addCostCenterToUser,
  addOrganizationToUser,
  addUser,
  deleteUser,
  impersonateUser,
  saveUser,
  setActiveUserByOrganization,
  setCurrentOrganization,
  updateUser,
} from './Mutations/Users'
import { getFeaturesByModule, listFeatures } from './Queries/Features'
import { getRole, hasUsers, listRoles } from './Queries/Roles'
import { getAppSettings, getSessionWatcher } from './Queries/Settings'
import {
  checkCustomerSchema,
  checkImpersonation,
  checkUserPermission,
  getActiveUserByEmail,
  getOrganizationsByEmail,
  getUser,
  getUserByEmail,
  getUsersByEmail,
  listAllUsers,
  listUsers,
  listUsersPaginated,
} from './Queries/Users'
import { Routes } from './Routes'

export const resolvers = {
  Mutation: {
    addCostCenterToUser,
    addOrganizationToUser,
    addUser,
    deleteRole,
    deleteUser,
    impersonateUser,
    saveRole,
    saveUser,
    sessionWatcher,
    setActiveUserByOrganization,
    setCurrentOrganization,
    updateUser,
  },
  Query: {
    checkCustomerSchema,
    checkImpersonation,
    checkUserPermission,
    getActiveUserByEmail,
    getAppSettings,
    getFeaturesByModule,
    getOrganizationsByEmail,
    getRole,
    getSessionWatcher,
    getUser,
    getUserByEmail,
    getUsersByEmail,
    hasUsers,
    listAllUsers,
    listFeatures,
    listRoles,
    listUsers,
    listUsersPaginated,
  },
  Routes,
}
