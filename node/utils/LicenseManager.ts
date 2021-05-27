import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

import { statusToError } from './index'

export class LMClient extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(`http://${ctx.account}.vtexcommercestable.com.br/`, ctx, {
      ...options,
      headers: {
        VtexIdclientAutCookie: ctx.authToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }


  private createRole = () => {
    const data:any = {
    "name": "B2B impersonate",
      "resources": [
          {
              "id": 1046,
              "hasAccess": true,
              "isCustomResource": false
          },
          {
              "id": 1153,
              "hasAccess": true,
              "isCustomResource": false
          }
      ],
      "logins": [],
      "roleType": 0
    }
    return this.post(this.routes.createRole(), data)
  }

  public saveUser = async (name: string, email: string) => {
    // List all roles
    const roles: any = await this.get(this.routes.getRoles())
    console.log('Roles =>', roles)
    let b2brole:any = null
    // Get only the role "B2B impersonate"
    b2brole = roles?.items?.find((role: any) => {
      role.name === "B2B impersonate"
    })
    console.log('B2B role A =>', b2brole)
    // Create this role if it doesn't exists
    if(!b2brole?.id) {
      b2brole = await this.createRole()
    }
    console.log('B2B role B =>', b2brole)
    const data = {
      email,
      name,
      roles: [
          {
              id: b2brole.id,
          }
      ]
    }

    // Check if the user exists
    const checkUser: any = await this.get(this.routes.userByEmail(email))
    if(!checkUser?.UserId) {
      // Create with role
      return this.post(this.routes.createUser(), data)
    } else {
      // Update with role
      return this.delete(this.routes.deleteUser(checkUser.UserId))
    }
  }


  public deleteUser = async (userId: string) => {
      return this.delete(this.routes.deleteUser(userId))
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
  protected delete = <T>(url: string) => {
    return this.http.delete<T>(url).catch(statusToError)
  }

  private get routes() {
    return {
      userByEmail: (email: string) => `api/license-manager/pvt/users/${encodeURIComponent(email)}`,
      addCallcenter: (userId: string) => `api/license-manager/users/${userId}/roles`,
      createUser: () => `api/license-manager/site/pvt/logins`,
      updateUser: (userId: string) => `api/license-manager/users/${userId}/roles`,
      getRoles: () => `api/license-manager/site/pvt/roles/list/paged`,
      createRole: () => `api/license-manager/site/pvt/roles`,
      deleteUser: (userId: string) => `api/license-manager/users/${userId}`,
    }
  }
}
