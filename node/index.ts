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
import { Service, AuthType, LRUCache } from '@vtex/api'

import { schemaDirectives } from './directives'
import { Clients } from './clients'
import { resolvers } from './resolvers'

const TIMEOUT_MS = 4000

const defaultClientOptions = {
  retries: 1,
  timeout: TIMEOUT_MS,
}

const memoryCache = new LRUCache<string, any>({ max: 1000 })

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
      Query: resolvers.Query,
      Mutation: resolvers.Mutation,
    },
    schemaDirectives,
  },
  routes: resolvers.Routes,
})
