import type { GraphQLResponse, InstanceOptions, IOContext } from '@vtex/api'
import { AppGraphQLClient } from '@vtex/api'

import { QUERIES } from '../resolvers/Routes/utils'
import { getTokenToHeader } from './index'
import type {
  GetCostCenterType,
  GetOrganizationsByEmailResponse,
} from '../typings/custom'

const getPersistedQuery = () => {
  return {
    persistedQuery: {
      provider: 'vtex.b2b-organizations-graphql@0.x',
      sender: 'vtex.storefront-permissions@1.x',
    },
  }
}

export class OrganizationsGraphQLClient extends AppGraphQLClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('vtex.b2b-organizations-graphql@0.x', ctx, options)
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

  public getCostCenterById = async (costId: string) => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getCostCenterById,
      variables: {
        id: costId,
      },
    }) as Promise<GraphQLResponse<GetCostCenterType>>
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

  public getOrganizationsByEmail = async (email: string) => {
    return this.query({
      extensions: getPersistedQuery(),
      query: QUERIES.getOrganizationsByEmail,
      variables: { email },
    }) as Promise<GetOrganizationsByEmailResponse>
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
