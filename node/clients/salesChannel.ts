import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

export interface SalesChannelResponse {
  Id: string
  Name: string
  CurrencyCode: string
  CurrencySymbol: string
  IsActive: boolean
  CultureInfo: string
}

export class SalesChannel extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, {
      ...options,
      headers: {
        VtexIdClientAutCookie: context.authToken,
      },
    })
  }

  public getSalesChannel = async () =>
    this.http.get<SalesChannelResponse>(
      '/api/catalog_system/pvt/saleschannel/list'
    )
}
