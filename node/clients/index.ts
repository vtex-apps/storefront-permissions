import { IOClients } from '@vtex/api'

import { LMClient } from '../utils/LicenseManager'
import { GraphQLServer } from './GraphQLServer'
// Extend the default IOClients implementation with our own custom clients.
export class Clients extends IOClients {
  public get lm() {
    return this.getOrSet('lm', LMClient)
  }

  public get graphqlServer() {
    return this.getOrSet('graphqlServer', GraphQLServer)
  }
}
