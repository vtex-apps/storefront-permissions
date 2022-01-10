import type { InstanceOptions, IOContext, RequestConfig } from '@vtex/api'
import { JanusClient } from '@vtex/api'

export class ProfileSystemClient extends JanusClient {
  private baseUrl = '/api/profile-system/pvt/profiles'

  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdClientAutCookie: context.authToken,
      },
      timeout: 5000,
    })
  }

  public getProfileInfo = (userId: string, customFields?: string) =>
    this.get(`${this.baseUrl}/${userId}/personalData`, {
      metric: 'profile-system-getProfileInfo',
      params: {
        extraFields: customFields,
      },
    })

  protected get = <T>(url: string, config?: RequestConfig) =>
    this.http.get<T>(url, config)
}
