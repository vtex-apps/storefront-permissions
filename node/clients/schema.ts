import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

import { getTokenToHeader } from './index'

const getRouteSchema = (dataEntity: string) =>
  `/api/dataentities/${dataEntity}/schemas`

export class Schema extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        ...getTokenToHeader(ctx),
        'x-vtex-user-agent': ctx.userAgent,
      },
    })
  }

  public async getLatestSchema(entityName: string) {
    const schemas = await this.http.get(getRouteSchema(entityName))

    return schemas && schemas.length > 0 ? schemas[schemas.length - 1] : null
  }
}
