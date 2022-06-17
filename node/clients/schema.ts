import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

const getRouteSchema = (dataEntity: string) =>
  `/api/dataentities/${dataEntity}/schemas`

export class Schema extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        ...(ctx.storeUserAuthToken
          ? { VtexIdclientAutCookie: ctx.storeUserAuthToken }
          : { VtexIdclientAutCookie: ctx.authToken }),
        'x-vtex-user-agent': ctx.userAgent,
      },
    })
  }

  public async getLatestSchema(entityName: string) {
    const schemas = await this.http.get(getRouteSchema(entityName))

    return schemas && schemas.length > 0 ? schemas[schemas.length - 1] : null
  }
}
