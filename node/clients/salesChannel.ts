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

export const SALES_CHANNEL_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

export class SalesChannel extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, {
      ...options,
      headers: {
        VtexIdClientAutCookie: context.authToken,
      },
    })
  }

  public getSalesChannel = async () => ({
    data: await this.http.get<SalesChannelResponse[]>(
      '/api/catalog_system/pvt/saleschannel/list',
      {
        forceMaxAge: SALES_CHANNEL_CACHE_MAX_AGE_MS,
        metric: 'get-sales-channel',
      }
    ),
  })
}
