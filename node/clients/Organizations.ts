import type { InstanceOptions, IOContext } from '@vtex/api'
import { AppGraphQLClient } from '@vtex/api'

import { QUERIES } from '../resolvers/Routes/utils'
import { getTokenToHeader } from './index'

const getPersistedQuery = () => {
  return {
    persistedQuery: {
      provider: 'vtex.b2b-organizations-graphql@2.x',
      sender: 'vtex.storefront-permissions@3.x',
    },
  }
}

export class OrganizationsGraphQLClient extends AppGraphQLClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('vtex.b2b-organizations-graphql@2.x', ctx, options)
  }

  public getOrganizationById = async (orgId: string): Promise<unknown> => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getOrganizationById,
      variables: {
        id: orgId,
      },
    })
  }

  public getB2BSettings = async (): Promise<unknown> => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getB2BSettings,
      variables: {},
    })
  }

  public getMarketingTags = async (costId: string): Promise<unknown> => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getMarketingTags,
      variables: {
        costId,
      },
    })
  }

  private query = async (param: {
    query: string
    variables: any
    extensions: any
  }) => {
    const { query, variables, extensions } = param

    return this.graphql.query(
      { query, variables, extensions },
      {
        headers: getTokenToHeader(this.context),
        params: {
          locale: this.context.locale,
        },
      }
    )
  }
}
