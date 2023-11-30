import { IOClients } from '@vtex/api'

import { LMClient } from '../utils/LicenseManager'
import { ProfileSystemClient } from '../utils/ProfileSystem'
import { Checkout } from './checkout'
import FullSessions from './FullSessions'
import IdentityClient from './IdentityClient'
import { OrganizationsGraphQLClient } from './Organizations'
import { SalesChannel } from './salesChannel'
import { Schema } from './schema'
import VtexId from './vtexId'

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

  public get organizations() {
    return this.getOrSet('organizations', OrganizationsGraphQLClient)
  }

  public get schema() {
    return this.getOrSet('schema', Schema)
  }

  public get vtexId() {
    return this.getOrSet('vtexId', VtexId)
  }

  public get identity() {
    return this.getOrSet('identity', IdentityClient)
  }

  public get salesChannel() {
    return this.getOrSet('salesChannel', SalesChannel)
  }

  public get fullSessions() {
    return this.getOrSet('fullSessions', FullSessions)
  }
}
