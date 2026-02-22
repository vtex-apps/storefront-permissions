export default class GraphQLError extends Error {
  public extensions: any

  constructor(message: string, details?: any) {
    super(message)
    this.extensions = {
      message,
      ...details,
      exception: {
        ...details?.exception,
        // vtex-node-api checks err?.extensions?.exception?.level before logging
        level: details?.logLevel || 'error',
      },
    }
  }
}
