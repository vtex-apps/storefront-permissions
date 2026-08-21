/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ClientsConfig,
  ServiceContext,
  ParamsContext,
  RecorderState,
  EventContext,
  IOContext,
  SegmentData,
} from '@vtex/api'
import { method, Service, AuthType, LRUCache } from '@vtex/api'

import { schemaDirectives } from './directives'
import { Clients } from './clients'
import { MASTERDATA_EXTENDED_CACHE_MAX_AGE_MS } from './clients/masterDataExtended'
import { SALES_CHANNEL_CACHE_MAX_AGE_MS } from './clients/salesChannel'
import { resolvers } from './resolvers'

const TIMEOUT_MS = 5000

const defaultClientOptions = {
  retries: 1,
  timeout: TIMEOUT_MS,
}

const memoryCache = new LRUCache<string, any>({ max: 1000 })

const salesChannelCache = new LRUCache<string, any>({
  max: 1000,
  maxAge: SALES_CHANNEL_CACHE_MAX_AGE_MS,
})

const masterDataExtendedCache = new LRUCache<string, any>({
  max: 1000,
  maxAge: MASTERDATA_EXTENDED_CACHE_MAX_AGE_MS,
})

const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: defaultClientOptions,
    settings: {
      memoryCache,
    },
    b2bAdmin: {
      authType: AuthType.bearer,
      memoryCache,
    },
    salesChannel: {
      memoryCache: salesChannelCache,
    },
    masterDataExtended: {
      memoryCache: masterDataExtendedCache,
    },
  },
}

declare global {
  type Context = ServiceContext<Clients>
  interface CustomIOContext extends IOContext {
    currentProfile: CurrentProfile
    segment?: SegmentData
    orderFormId?: string
  }

  interface CurrentProfile {
    email: string
    userId: string
  }
  interface StatusChangeContext extends EventContext<Clients> {
    body: {
      domain: string
      orderId: string
      currentState: string
      lastState: string
      currentChangeDate: string
      lastChangeDate: string
    }
  }

  interface State {
    code: number
  }
}

export default new Service<Clients, RecorderState, ParamsContext>({
  clients,
  graphql: {
    resolvers: {
      Mutation: resolvers.Mutation,
      Query: resolvers.Query,
    },
    schemaDirectives,
  },
  routes: {
    checkPermissions: method({
      GET: resolvers.Routes.checkPermissions,
    }),
    setProfile: method({
      POST: resolvers.Routes.setProfile,
    }),
  },
})
