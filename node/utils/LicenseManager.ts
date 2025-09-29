/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

import { statusToError, toUUID } from './index'

export class LMClient extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(`http://${ctx.account}.vtexcommercestable.com.br/`, ctx, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        VtexIdclientAutCookie: ctx.authToken,
      },
    })
  }

  public getUserIdByEmail = async (email: string) => {
    return this.get(this.routes.userByEmail(email))
      .then((res: any) => {
        return res?.UserId ? toUUID(res.UserId) : null
      })
      .catch(() => {
        return null
      })
  }

  public saveUser = async (name: string, email: string) => {
    const data = {
      email,
      name,
      roles: [
        {
          id: 957,
        },
      ],
    }

    // Check if the user exists
    const checkUser: any = await this.get(this.routes.userByEmail(email))
      .then((res: any) => {
        return res
      })
      .catch(() => {
        return {}
      })

    if (!checkUser?.UserId) {
      // Create with role
      return this.post(this.routes.createUser(), data)
        .then(() => true)
        .catch(() => false)
    }

    // Update with role
    return this.put(this.routes.updateUser(checkUser.UserId), [957]).then(
      () => {
        return { userId: checkUser.UserId }
      }
    )
  }

  public deleteUser = async (userId: string) => {
    const user = await this.get(this.routes.userById(userId))
      .then(() => {
        return true
      })
      .catch(() => {
        return false
      })

    return user ? this.delete(this.routes.deleteUser(userId, '957'), {}) : {}
  }

  public getUserAdminPermissions = async (account: string, userId: string) => {
    return this.get(this.routes.getUserAdminPermissions(account, userId)).then(
      (res: any) => {
        return res
      }
    )
  }

  public checkUserSpecificRole = async (
    account: string,
    userEmail: string,
    productCode: number,
    resourceCode: string
  ) => {
    return this.get(
      `/api/license-manager/pvt/accounts/${encodeURI(
        account
      )}/products/${productCode}/logins/${encodeURI(
        userEmail
      )}/resources/${encodeURI(resourceCode)}/granted`
    ).then((res: any) => {
      return res
    })
  }

  public hasBuyerOrganizationViewRole = async (account: string, userEmail: string) => {
    try {
      const hasRole = await this.checkUserSpecificRole(account, userEmail, 97, 'buyer_organization_view')
      return hasRole === true
    } catch (error) {
      return false
    }
  }

  public hasBuyerOrganizationEditRole = async (account: string, userEmail: string) => {
    try {
      const hasRole = await this.checkUserSpecificRole(account, userEmail, 97, 'buyer_organization_edit')
      return hasRole === true
    } catch (error) {
      return false
    }
  }

  protected get = <T>(url: string) => {
    return this.http.get<T>(url).catch(statusToError)
  }

  protected post = <T>(url: string, data: any) => {
    return this.http.post<T>(url, data).catch(statusToError)
  }

  protected put = <T>(url: string, data: any) => {
    return this.http.put<T>(url, data).catch(statusToError)
  }

  protected delete = <T>(url: string, data: any) => {
    return this.http.delete<T>(url, data).catch(statusToError)
  }

  private get routes() {
    return {
      addCallcenter: (userId: string) =>
        `api/license-manager/users/${userId}/roles`,
      createRole: () => `api/license-manager/site/pvt/roles`,
      createUser: () => `api/license-manager/site/pvt/logins`,
      deleteUser: (userId: string, roleId: string) =>
        `api/license-manager/users/${userId}/roles/${roleId}`,
      getRoles: () => `api/license-manager/site/pvt/roles/list/paged`,
      updateUser: (userId: string) =>
        `api/license-manager/users/${userId}/roles`,
      userByEmail: (email: string) =>
        `api/license-manager/pvt/users/${encodeURIComponent(email)}`,
      userById: (id: string) => `api/license-manager/pvt/users/${id}`,
      getUserAdminPermissions: (account: string, userId: string) =>
        `/api/license-manager/pvt/accounts/${account}/logins/${userId}/granted`,
    }
  }
}
