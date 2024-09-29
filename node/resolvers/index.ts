/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { deleteRole, saveRole } from './Mutations/Roles'
import { sessionWatcher } from './Mutations/Settings'
import {
  addCostCenterToUser,
  addOrganizationToUser,
  addUser,
  deleteUser,
  ignoreB2BSessionData,
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
  getAllUsersByEmail,
  getB2BUserById,
  getOrganizationsByEmail,
  getOrganizationsByEmailPaginated,
  getUser,
  getUserByEmail,
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
    ignoreB2BSessionData,
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
    getB2BUser: getB2BUserById,
    getFeaturesByModule,
    getOrganizationsByEmail,
    getOrganizationsByEmailPaginated,
    getRole,
    getSessionWatcher,
    getUser,
    getUserByEmail,
    getUsersByEmail: getAllUsersByEmail,
    hasUsers,
    listAllUsers,
    listFeatures,
    listRoles,
    listUsers,
    listUsersPaginated,
  },
  Routes,
}
