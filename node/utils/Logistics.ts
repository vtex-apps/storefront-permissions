import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

import { statusToError } from './index'

export class LogicticsClient extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(`http://logistics.vtexcommercestable.com.br/`, ctx, {
      ...options,
      headers: {
        VtexIdclientAutCookie: ctx.authToken,
        'Proxy-Authorization': ctx.authToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  public get = (id: string) => this.getDock(this.routes.dock(id))

  protected getDock = <T>(url: string) => {
    return this.http.get<T>(url).catch(statusToError)
  }

  private get routes() {
    return {
      dock: (id: string) => `api/logistics/pvt/configuration/docks/${id}?an=${this.context.account}`,
    }
  }
}
