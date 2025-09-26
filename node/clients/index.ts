import type { IOContext } from '@vtex/api'
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
import { MasterDataExtended } from './masterDataExtended'
import { LocalSessionClient } from './session'

export const getTokenToHeader = (ctx: IOContext) => {
  const adminToken = ctx.authToken
  const userToken = ctx.storeUserAuthToken
  const { sessionToken, account } = ctx

  let allCookies = `VtexIdclientAutCookie=${adminToken}`

  if (userToken) {
    allCookies += `; VtexIdclientAutCookie_${account}=${userToken}`
  }

  return {
    'x-vtex-credential': ctx.authToken,
    VtexIdclientAutCookie: adminToken,
    cookie: allCookies,
    ...(sessionToken && {
      'x-vtex-session': sessionToken,
    }),
  }
}

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

  public get masterDataExtended() {
    return this.getOrSet('masterDataExtended', MasterDataExtended)
  }

  public get localSessionClient() {
    return this.getOrSet('localSessionClient', LocalSessionClient)
  }
}
