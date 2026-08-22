import { describeClientError } from '../utils/clientError'

const axiosStyleError = () => ({
  code: 'ERR_BAD_REQUEST',
  config: {
    data: JSON.stringify({
      address: { postalCode: '99999', street: 'Private Road 9' },
    }),
    method: 'post',
    url: '/api/dataentities/b2b_users/search?_where=email=shopper@secret.com',
  },
  message: 'Request failed with status code 400',
  response: {
    data: {
      error: { code: 'CHK0040', message: 'O campo rua não aceita' },
      operationId: 'op-123',
    },
    headers: {
      'x-request-id': 'req-456',
      'x-vtex-janus-router-backend-app': 'chk-v2.388.4-prd-598',
      'x-vtex-operation-id': 'op-123',
    },
    status: 400,
  },
  stack: 'AxiosError: Request failed with status code 400\n    at settle (...)',
})

describe('describeClientError', () => {
  it('extracts status, codes and the correlation ids VTEX backends answer with', () => {
    const described: any = describeClientError(axiosStyleError())

    expect(described).toMatchObject({
      backend: 'chk-v2.388.4-prd-598',
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 400',
      method: 'post',
      operationId: 'op-123',
      requestId: 'req-456',
      status: 400,
      vtexErrorCode: 'CHK0040',
    })
  })

  it('never carries the request body or the query string', () => {
    const serialized = JSON.stringify(describeClientError(axiosStyleError()))

    // The body (config.data) is where addresses and profile data live.
    expect(serialized).not.toContain('Private Road')
    expect(serialized).not.toContain('99999')
    // The query string is where Master Data lookups carry the email.
    expect(serialized).not.toContain('shopper@secret.com')
    expect(serialized).toContain('/api/dataentities/b2b_users/search')
  })

  it('redacts emails echoed into error messages', () => {
    const described: any = describeClientError({
      message: 'user shopper@secret.com not found',
      response: { data: { Message: 'no row for shopper@secret.com' } },
    })

    expect(described.message).toBe('user <redacted-email> not found')
    expect(described.vtexErrorMessage).toBe('no row for <redacted-email>')
  })

  it('falls back to the error-code headers when the body has none', () => {
    const described: any = describeClientError({
      response: {
        data: 'Acesso negado',
        headers: { 'x-vtex-error-code': 'CHK0040' },
        status: 403,
      },
    })

    expect(described.status).toBe(403)
    expect(described.vtexErrorCode).toBe('CHK0040')
  })

  it('handles plain errors, strings and nothing at all', () => {
    const plain: any = describeClientError(new Error('boom'))

    expect(plain.message).toBe('boom')
    expect(plain.stack).toContain('Error: boom')

    expect(describeClientError('just text')).toEqual({ message: 'just text' })
    expect(describeClientError(null)).toBeNull()
    expect(describeClientError(undefined)).toBeNull()
  })

  it('redacts emails from the stack, whose first line repeats the message', () => {
    const error = new Error('user shopper@secret.com not found')

    const described: any = describeClientError(error)

    expect(described.stack).toContain('<redacted-email>')
    expect(described.stack).not.toContain('shopper@secret.com')
  })

  it('keeps the stack to a few lines of code locations', () => {
    const longStack = ['Error: x', ...Array(30).fill('    at somewhere')].join(
      '\n'
    )

    const described: any = describeClientError({ message: 'x', stack: longStack })

    expect(described.stack.split('\n')).toHaveLength(5)
  })
})
