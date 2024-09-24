export interface Order {
  orderId: string
  clientProfileData: ClientProfileData | null
  creationDate: string
  clientName: string
  items: Item[] | null
  comments: Comment[] | null
  totalValue: number
  status: string
  statusDescription: string | null
  sequence: string | null
  salesChannel: string
  affiliateId: string | null
  origin: string | null
  workflowInErrorState: boolean | null
  workflowInRetry: boolean | null
  ShippingEstimatedDate: string | null
  ShippingEstimatedDateMax: string
  ShippingEstimatedDateMin: string
  orderIsComplete: boolean | null
  authorizedDate: string | null
  callCenterOperatorName: string | null
  totalItems: number | null
  currencyCode: string | null
  hostname: string
  checkedInPickupPointId: string
  shippingData: ShippingData | null
  paymentData: PaymentData | null
  storePreferencesData: StorePreferencesData | null
  fulfillment?: Fulfillment
}

export interface StorePreferencesData {
  countryCode: string
  currencyCode: string
}

export interface PaymentData {
  transactions: Transaction[]
}

export interface Transaction {
  isActive: boolean
  payments: Payment[]
}

export interface Payment {
  id: string | null
  paymentSystem: string
  paymentSystemName: string
  value: number
  installments: number | null
  referenceValue: number | null
}

export interface ClientProfileData {
  corporateDocument: string | null
  corporateName: string | null
  corporatePhone: string | null
  customerClass: string | null
  document: string | null
  documentType: string | null
  email: string
  firstName: string | null
  id: string
  isCorporate: boolean
  lastName: string | null
  phone: string | null
  stateInscription: string | null
  tradeName: string | null
  userProfileId: string | null
}

export type ProductCategory = {
  id: string
  name: string
}

export type ItemAdditionalInfo = {
  categories: ProductCategory[]
}

export interface Item {
  seller: string
  quantity: number
  description: string | null
  ean: string | null
  refId: string | null
  id: string | null
  productId: string | null
  sellingPrice: number
  price: number
  imageUrl: string | null
  skuName: string | null
  name: string
  additionalInfo: ItemAdditionalInfo
}

export interface Comment {
  createdBy: CommentCreatedBy | null
  creationDate: string
  description: string
  domain: string
  id: string
  lastUpdate: string | null
  owner: string | null
  target: CommentTarget | null
}

export interface CommentCreatedBy {
  id: string
  name: string
  email: string | null
  key: string | null
}

export interface CommentTarget {
  id: string
  type: string | null
  url: string | null
}

export interface ShippingData {
  id: string | null
  logisticsInfo: LogisticsInfoItem[]
  selectedAddresses: Address[]
}

export interface LogisticsInfoItem {
  itemIndex: number
  selectedSla: string
  lockTTL: string | null
  price: number
  listPrice: number
  sellingPrice: number
  deliveryCompany: string | null
  shippingEstimate: string
  shippingEstimateDate: string | null
  deliveryChannel: string
  addressId: string
  pickupStoreInfo: PickupStoreInfo
  pickupPointId: string | null
  slas: SLA[]
}

export interface PickupStoreInfo {
  additionalInfo: string | null
  address: Address | null
  dockId: string | null
  friendlyName: string | null
  isPickupStore: boolean
}

export interface Address {
  addressId: string
  addressType: string
  receiverName: string | null
  street: string
  number: string
  complement: string | null
  neighborhood: string
  postalCode: string
  city: string
  state: string
  country: string
  reference: string | null
  geoCoordinates: number[] | null
}

export interface SLA {
  id: string | null
  deliveryChannel: string | null
  name: string | null
  deliveryIds: DeliveryId[]
  shippingEstimate: string | null
  shippingEstimateDate: string | null
  lockTTL: string | null
  price: number | null
  listPrice: number | null
  tax: number | null
  pickupStoreInfo: PickupStoreInfo | null
  pickupPointId: string | null
  pickupDistance: number | null
  polygonName: string | null
}

export interface DeliveryId {
  courierId: string | null
  warehouseId: string | null
  dockId: string | null
  courierName: string | null
  quantity: number | null
}

export interface GetOrganizationsByEmailResponse {
  data: {
    getOrganizationsByEmail: Array<{
      id: string
      organizationStatus: string
      orgId: string
      costId: string
      costCenterName: string
    }>
  }
}
