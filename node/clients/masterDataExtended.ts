import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

/*
  The default Master Data client was causing higher response times compared
  to calling Master Data directly from the app using this custom client.
*/

export class MasterDataExtended extends JanusClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super(context, {
      ...options,
      headers: {
        VtexIdClientAutCookie: context.authToken,
      },
    })
  }

  public getDocumentById = async (
    dataEntity: string,
    id: string,
    fields: string[]
  ) =>
    this.http.get(
      `/api/dataentities/${dataEntity}/documents/${id}?_fields=${fields.join(
        ','
      )}`
    )
}
