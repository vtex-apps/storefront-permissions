import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

export default class FullSessions extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
    })
  }

  public async getSessions({ headers }: any): Promise<any> {
    return this.http.get('/api/sessions?items=*', {
      headers,
    })
  }
}
