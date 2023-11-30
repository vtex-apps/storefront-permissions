import type { InstanceOptions, IOContext } from '@vtex/api'
import { AppClient, GraphQLClient } from '@vtex/api'

import { QUERIES } from '../resolvers/Routes/utils'

const getTokenToHeader = (ctx: IOContext) => {
  return {
    VtexIdclientAutCookie:
      ctx.storeUserAuthToken ?? ctx.adminUserAuthToken ?? ctx.authToken,
  }
}

const getPersistedQuery = () => {
  return {
    persistedQuery: {
      provider: 'vtex.b2b-organizations-graphql@0.x',
      sender: 'vtex.storefront-permissions@1.x',
    },
  }
}

export class OrganizationsGraphQLClient extends AppClient {
  protected graphql: GraphQLClient

  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('vtex.graphql-server@1.x', ctx, options)
    this.graphql = new GraphQLClient(this.http)
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

  public getCostCenterById = async (costId: string): Promise<unknown> => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getCostCenterById,
      variables: {
        id: costId,
      },
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

  public getOrganizationsByEmail = async (email: string): Promise<unknown> => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getOrganizationsByEmail,
      variables: { email },
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
        params: {
          headers: getTokenToHeader(this.context),
          locale: this.context.locale,
        },
        url: '/graphql',
      }
    )
  }
}
