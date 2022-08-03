import { parse } from 'cookie'
import { keys } from 'ramda'

const isUserLoggedIn = (ctx: Context) => {
  const {
    vtex: { account },
  } = ctx

  return !!ctx.cookies.get(`VtexIdclientAutCookie_${account}`)
}

const parseCookie = (cookie: string) => {
  const parsed = parse(cookie)
  const [cookieName] = keys(parsed)
  const cookieValue = parsed[cookieName]

  const extraOptions = {
    domain: parsed.domain,
    expires: parsed.expires ? new Date(parsed.expires) : undefined,
    path: parsed.path,
  }

  return {
    name: cookieName,
    options: extraOptions,
    value: cookieValue,
  }
}

/** Checkout cookie methods */
const CHECKOUT_COOKIE = 'checkout.vtex.com'

const checkoutCookieFormat = (orderFormId: string) =>
  `${CHECKOUT_COOKIE}=__ofid=${orderFormId};`

const getOrderFormIdFromCookie = (cookies: Context['cookies']) => {
  const cookie = cookies.get(CHECKOUT_COOKIE)

  return cookie && cookie.split('=')[1]
}

export {
  isUserLoggedIn,
  CHECKOUT_COOKIE,
  checkoutCookieFormat,
  getOrderFormIdFromCookie,
  parseCookie,
}
