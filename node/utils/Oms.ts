import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

import { statusToError } from './index'

export class OMSClient extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(`http://${ctx.account}.vtexcommercestable.com.br/`, ctx, {
      ...options,
      headers: {
        VtexIdclientAutCookie: ctx.authToken,
        'Proxy-Authorization': ctx.authToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  public order = (id: string) => this.get(this.routes.order(id))

  protected get = <T>(url: string) => {
    return this.http.get<T>(url).catch(statusToError)
  }

  private get routes() {
    return {
      order: (id: string) => `api/oms/pvt/orders/${id}`,
    }
  }
}
