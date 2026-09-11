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
      )}`,
      {
        metric: 'masterdata-get-document',
      }
    )

  /**
   * Write a document under an id the caller chooses.
   *
   * Deliberately sends no `_schema`. The entity this is used for carries no
   * schema at all: it is only ever read by document id, never searched, so
   * there is nothing for a schema to validate or index. Master Data creates
   * the entity on the first write, which also means no per-account
   * provisioning step.
   */
  public putDocumentById = async (
    dataEntity: string,
    id: string,
    fields: Record<string, unknown>
  ) =>
    this.http.put(`/api/dataentities/${dataEntity}/documents/${id}`, fields, {
      metric: 'masterdata-put-document',
    })

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
        headers: {
          'REST-Range': `resources=${from}-${to}`,
        },
        metric: 'masterdata-search',
      }
    )
  }
}
