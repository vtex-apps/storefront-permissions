import { IOClients } from '@vtex/api'

import { LMClient } from '../utils/LicenseManager'

// Extend the default IOClients implementation with our own custom clients.
export class Clients extends IOClients {
  public get lm() {
    return this.getOrSet('lm', LMClient)
  }
}
