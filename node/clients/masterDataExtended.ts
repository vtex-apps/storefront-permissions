import type { InstanceOptions, IOContext } from '@vtex/api'
import { JanusClient } from '@vtex/api'

/*
  The default Master Data client was causing higher response times compared
  to calling Master Data directly from the app using this custom client.
*/

export const MASTERDATA_EXTENDED_CACHE_MAX_AGE_MS = 30 * 60 * 1000

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
      )}`,
      {
        forceMaxAge: MASTERDATA_EXTENDED_CACHE_MAX_AGE_MS,
        metric: 'masterdata-get-document',
      }
    )

  public searchDocuments = <T = unknown>(params: {
    dataEntity: string
    fields: string[]
    where?: string
    schema?: string
    sort?: string
    pagination?: { page: number; pageSize: number }
  }) => {
    const {
      dataEntity,
      fields,
      where,
      schema,
      sort,
      pagination = { page: 1, pageSize: 50 },
    } = params

    const from = (pagination.page - 1) * pagination.pageSize
    const to = from + pagination.pageSize - 1
    const query = new URLSearchParams({
      _fields: fields.join(','),
    })

    if (where) {
      query.set('_where', where)
    }

    if (schema) {
      query.set('_schema', schema)
    }

    if (sort) {
      query.set('_sort', sort)
    }

    return this.http.get<T[]>(
      `/api/dataentities/${dataEntity}/search?${query.toString()}`,
      {
        forceMaxAge: MASTERDATA_EXTENDED_CACHE_MAX_AGE_MS,
        headers: {
          'REST-Range': `resources=${from}-${to}`,
        },
        metric: 'masterdata-search',
      }
    )
  }
}
