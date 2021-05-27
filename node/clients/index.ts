import { IOClients } from '@vtex/api'

import { Scheduler } from '../utils/Scheduler'
import { OMSClient } from '../utils/Oms'
import { LogicticsClient } from '../utils/Logistics'
import { LMClient } from '../utils/LicenseManager'

// Extend the default IOClients implementation with our own custom clients.
export class Clients extends IOClients {

  public get oms() {
    return this.getOrSet('oms', OMSClient)
  }

  public get lm() {
    return this.getOrSet('lm', LMClient)
  }

  public get scheduler() {
    return this.getOrSet('scheduler', Scheduler)
  }

  public get dock() {
    return this.getOrSet('dock', LogicticsClient)
  }
}
