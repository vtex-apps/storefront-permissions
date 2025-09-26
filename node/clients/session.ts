import type { InstanceOptions, IOContext, RequestTracingConfig } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

const routes = {
    base: '/api/sessions',
}

export class LocalSessionClient extends ExternalClient {
    constructor(context: IOContext, options?: InstanceOptions) {
        super(`http://${context.workspace}--${context.account}.myvtex.com`, context, {
            ...options,
            headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'x-vtex-workspace': 'giurigaud',
            },
        })
    }

  /**
   * Update the public portion of this session
   */
  public updateSession = (
    key: string,
    value: any,
    items: string[],
    token: any,
    tracingConfig?: RequestTracingConfig
  ) => {
    console.log('updateSession - AQUI')
    const data = { public: { [key]: { value } } }
    const metric = 'session-update'
    const config = {
      headers: {
        ...this.options?.headers,
        Cookie: `vtex_session=${token};`,
      },
      metric,
      params: {
        items: items.join(','),
      },
      tracing: {
        requestSpanNameSuffix: metric,
        ...tracingConfig?.tracing,
      },
    }

    return this.http.post(routes.base, data, config)
  }
}
