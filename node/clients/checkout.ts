/* eslint-disable max-params */
import type {
  InstanceOptions,
  IOContext,
  IOResponse,
  RequestConfig,
} from '@vtex/api'
import { JanusClient } from '@vtex/api'
import type { AxiosError } from 'axios'

import { checkoutCookieFormat, statusToError } from '../utils'

export class Checkout extends JanusClient {
  private get routes() {
    const base = '/api/checkout/pub'

    return {
      addItem: (orderFormId: string, queryString: string) =>
        `${base}/orderForm/${orderFormId}/items${queryString}`,
      cancelOrder: (orderFormId: string) =>
        `${base}/orders/${orderFormId}/user-cancel-request`,
      orderFormCustomData: (
        orderFormId: string,
        appId: string,
        field: string
      ) => `${base}/orderForm/${orderFormId}/customData/${appId}/${field}`,
      updateItems: (orderFormId: string) =>
        `${base}/orderForm/${orderFormId}/items/update`,
      profile: (orderFormId: string) =>
        `${base}/orderForm/${orderFormId}/profile`,
      attachmentsData: (orderFormId: string, field: string) =>
        `${base}/orderForm/${orderFormId}/attachments/${field}`,
      attachmentItem: (
        orderFormId: string,
        field: string,
        index: string | number
      ) =>
        `${base}/orderForm/${orderFormId}/items/${index}/attachments/${field}`,
      assemblyOptions: (
        orderFormId: string,
        itemId: string | number,
        assemblyOptionsId: string
      ) =>
        `${base}/orderForm/${orderFormId}/items/${itemId}/assemblyOptions/${assemblyOptionsId}`,
      checkin: (orderFormId: string) =>
        `${base}/orderForm/${orderFormId}/checkIn`,
      orderForm: (orderFormId?: string) =>
        `${base}/orderForm/${orderFormId ?? ''}`,
      orders: `${base}/orders`,
      simulation: (queryString: string) =>
        `${base}/orderForms/simulation${queryString}`,
      changeToAnonymousUser: (orderFormId: string) =>
        `/checkout/changeToAnonymousUser/${orderFormId}`,
    }
  }

  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        ...(ctx.storeUserAuthToken
          ? { VtexIdclientAutCookie: ctx.storeUserAuthToken }
          : { VtexIdclientAutCookie: ctx.authToken }),
        'x-vtex-user-agent': ctx.userAgent,
      },
    })
  }

  public addItem = (orderFormId: string, items: any) =>
    this.post<OrderForm>(
      this.routes.addItem(orderFormId, this.getChannelQueryString()),
      { orderItems: items },
      { metric: 'checkout-addItem' }
    )

  public cancelOrder = (orderFormId: string, reason: string) =>
    this.post(
      this.routes.cancelOrder(orderFormId),
      { reason },
      { metric: 'checkout-cancelOrder' }
    )

  public setOrderFormCustomData = (
    orderFormId: string,
    appId: string,
    field: string,
    value: any
  ) =>
    this.put(
      this.routes.orderFormCustomData(orderFormId, appId, field),
      { value },
      { metric: 'checkout-setOrderFormCustomData' }
    )

  public updateItems = (orderFormId: string, orderItems: any) =>
    this.post(
      this.routes.updateItems(orderFormId),
      { orderItems },
      { metric: 'checkout-updateItems' }
    )

  public updateOrderFormIgnoreProfile = (
    orderFormId: string,
    ignoreProfileData: boolean
  ) =>
    this.patch(
      this.routes.profile(orderFormId),
      { ignoreProfileData },
      { metric: 'checkout-updateOrderFormIgnoreProfile' }
    )

  public updateOrderFormPayment = (orderFormId: string, payments: any) =>
    this.post(
      this.routes.attachmentsData(orderFormId, 'paymentData'),
      { payments },
      { metric: 'checkout-updateOrderFormPayment' }
    )

  public updateOrderFormProfile = (orderFormId: string, fields: any) =>
    this.post(
      this.routes.attachmentsData(orderFormId, 'clientProfileData'),
      fields,
      { metric: 'checkout-updateOrderFormProfile' }
    )

  public updateOrderFormShipping = (orderFormId: string, shipping: any) =>
    this.post(
      this.routes.attachmentsData(orderFormId, 'shippingData'),
      shipping,
      { metric: 'checkout-updateOrderFormShipping' }
    )

  public updateOrderFormMarketingData = (
    orderFormId: string,
    marketingData: any
  ) =>
    this.post(
      this.routes.attachmentsData(orderFormId, 'marketingData'),
      marketingData,
      { metric: 'checkout-updateOrderFormMarketingData' }
    )

  public async clearCart(orderFormId: string) {
    return this.post(
      `${this.routes.orderForm(orderFormId)}/items/removeAll`,
      {}
    )
  }

  public updateSalesChannel = async (
    orderFormId: string,
    salesChannel: any
  ) => {
    const orderForm = await this.get(this.routes.orderForm(orderFormId))

    const { items, salesChannel: sc }: any = orderForm

    if (String(salesChannel) !== String(sc) && items?.length) {
      await this.clearCart(orderFormId)

      await this.post(
        `${this.routes.orderForm(orderFormId)}/items?sc=${salesChannel}`,
        {
          orderItems: items.map((item: any) => ({
            id: item.id,
            index: item.index,
            price: item.price,
            quantity: item.quantity,
            seller: item.seller,
          })),
        }
      )

      // Check attachments
      const attachmentPromise: any[] = []

      items.forEach((item: { attachments: any[] }, index: string | number) => {
        if (item.attachments?.length) {
          item.attachments.forEach(
            (attachment: { name: string; content: any }) => {
              attachmentPromise.push(
                this.post(
                  this.routes.attachmentItem(
                    orderFormId,
                    attachment.name,
                    index
                  ),
                  {
                    content: attachment.content,
                  }
                )
              )
            }
          )
        }
      })
      if (attachmentPromise.length) {
        await Promise.all(attachmentPromise)
      }
    }

    return orderForm
  }

  public updateOrderFormClientPreferencesData = (
    orderFormId: string,
    clientPreferencesData: OrderFormClientPreferencesData
  ) => {
    // The API default value of `optinNewsLetter` is `null`, but it doesn't accept a POST with its value as `null`
    const filteredClientPreferencesData =
      clientPreferencesData.optinNewsLetter === null
        ? { locale: clientPreferencesData.locale }
        : clientPreferencesData

    return this.post(
      this.routes.attachmentsData(orderFormId, 'clientPreferencesData'),
      filteredClientPreferencesData,
      { metric: 'checkout-updateOrderFormClientPreferencesData' }
    )
  }

  public addAssemblyOptions = async (
    orderFormId: string,
    itemId: string | number,
    assemblyOptionsId: string,
    body: any
  ) =>
    this.post<OrderForm>(
      this.routes.assemblyOptions(orderFormId, itemId, assemblyOptionsId),
      body,
      { metric: 'checkout-addAssemblyOptions' }
    )

  public removeAssemblyOptions = async (
    orderFormId: string,
    itemId: string | number,
    assemblyOptionsId: string,
    body: any
  ) =>
    this.delete<OrderForm>(
      this.routes.assemblyOptions(orderFormId, itemId, assemblyOptionsId),
      { metric: 'checkout-removeAssemblyOptions', data: body }
    )

  public updateOrderFormCheckin = (orderFormId: string, checkinPayload: any) =>
    this.post(this.routes.checkin(orderFormId), checkinPayload, {
      metric: 'checkout-updateOrderFormCheckin',
    })

  public orderForm = (orderFormId?: string) => {
    return this.get<OrderForm>(this.routes.orderForm(orderFormId), {
      metric: 'checkout-orderForm',
    })
  }

  public orderFormRaw = () => {
    return this.postRaw<OrderForm>(
      this.routes.orderForm(),
      { expectedOrderFormSections: ['items'] },
      { metric: 'checkout-orderForm' }
    )
  }

  public newOrderForm = (orderFormId?: string) => {
    return this.http
      .postRaw<OrderForm>(this.routes.orderForm(orderFormId), undefined, {
        metric: 'checkout-newOrderForm',
      })
      .catch(statusToError) as Promise<IOResponse<OrderForm>>
  }

  public changeToAnonymousUser = (orderFormId: string) => {
    return this.get(this.routes.changeToAnonymousUser(orderFormId), {
      metric: 'checkout-change-to-anonymous',
    }).catch((err) => {
      // This endpoint is expected to return a redirect to
      // the user, so we can ignore the error if it is a 3xx
      if (!err.response || /^3..$/.test((err as AxiosError).code ?? '')) {
        throw err
      }
    })
  }

  public orders = () =>
    this.get(this.routes.orders, { metric: 'checkout-orders' })

  public simulation = (simulation: SimulationPayload) =>
    this.post<SimulationOrderForm>(
      this.routes.simulation(this.getChannelQueryString()),
      simulation,
      {
        metric: 'checkout-simulation',
      }
    )

  public getRegionId = (
    country: string,
    postalCode: string | null,
    salesChannel: string,
    geoCoordinates: [number, number] | null
  ): Promise<RegionsResponse[]> => {
    const baseUrl = '/api/checkout/pub/regions'
    const params = new URLSearchParams({
      country,
      sc: salesChannel,
    })

    if (postalCode) {
      params.append('postalCode', postalCode)
    }

    if (geoCoordinates) {
      params.append('geoCoordinates', geoCoordinates.join(';'))
    }

    const url = `${baseUrl}?${params.toString()}`

    return this.get(url)
  }

  protected get = <T>(url: string, config: RequestConfig = {}) => {
    config.headers = {
      ...config.headers,
      ...this.getCommonHeaders(),
    }

    return this.http.get<T>(url, config).catch(statusToError) as Promise<T>
  }

  protected post = <T>(url: string, data?: any, config: RequestConfig = {}) => {
    config.headers = {
      ...config.headers,
      ...this.getCommonHeaders(),
    }

    return this.http
      .post<T>(url, data, config)
      .catch(statusToError) as Promise<T>
  }

  protected postRaw = async <T>(
    url: string,
    data?: any,
    config: RequestConfig = {}
  ) => {
    config.headers = {
      ...config.headers,
      ...this.getCommonHeaders(),
    }

    return this.http
      .postRaw<T>(url, data, config)
      .catch(statusToError) as Promise<IOResponse<T>>
  }

  protected delete = <T>(url: string, config: RequestConfig = {}) => {
    config.headers = {
      ...config.headers,
      ...this.getCommonHeaders(),
    }

    return this.http.delete<T>(url, config).catch(statusToError) as Promise<
      IOResponse<T>
    >
  }

  protected patch = <T>(
    url: string,
    data?: any,
    config: RequestConfig = {}
  ) => {
    config.headers = {
      ...config.headers,
      ...this.getCommonHeaders(),
    }

    return this.http
      .patch<T>(url, data, config)
      .catch(statusToError) as Promise<T>
  }

  protected put = <T>(url: string, data?: any, config: RequestConfig = {}) => {
    config.headers = {
      ...config.headers,
      ...this.getCommonHeaders(),
    }

    return this.http
      .put<T>(url, data, config)
      .catch(statusToError) as Promise<T>
  }

  private getCommonHeaders = () => {
    const { orderFormId, segmentToken, sessionToken } = this
      .context as CustomIOContext

    const checkoutCookie = orderFormId ? checkoutCookieFormat(orderFormId) : ''
    const segmentTokenCookie = segmentToken
      ? `vtex_segment=${segmentToken};`
      : ''

    const sessionTokenCookie = sessionToken
      ? `vtex_session=${sessionToken};`
      : ''

    return {
      Cookie: `${checkoutCookie}${segmentTokenCookie}${sessionTokenCookie}`,
    }
  }

  private getChannelQueryString = () => {
    const { segment } = this.context as CustomIOContext
    const channel = segment?.channel
    const queryString = channel ? `?sc=${channel}` : ''

    return queryString
  }
}
