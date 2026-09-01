export interface StaleRevalidateData<T> {
  data: T
  /**
   * Serialized as an ISO string once it round-trips through VBase's JSON
   * storage, so consumers must accept both shapes.
   */
  ttl: Date | string
}
