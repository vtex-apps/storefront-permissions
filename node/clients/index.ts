import { IOClients } from '@vtex/api'

import { LMClient } from '../utils/LicenseManager'
import { ProfileSystemClient } from '../utils/ProfileSystem'
import { GraphQLServer } from './GraphQLServer'
import { Checkout } from './checkout'
import { Schema } from './schema'

// Extend the default IOClients implementation with our own custom clients.
export class Clients extends IOClients {
  public get lm() {
    return this.getOrSet('lm', LMClient)
  }

  public get profileSystem() {
    return this.getOrSet('profileSystem', ProfileSystemClient)
  }

  public get checkout() {
    return this.getOrSet('checkout', Checkout)
  }

  public get graphqlServer() {
    return this.getOrSet('graphqlServer', GraphQLServer)
  }

  public get schema() {
    return this.getOrSet('schema', Schema)
  }
}
