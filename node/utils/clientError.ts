/**
 * What gets logged when an outbound call fails.
 *
 * Never log a client error object whole: the HTTP client attaches the request
 * to it, so `error.config.data` is the request body (addresses, profile data)
 * and `error.config.url` can carry emails in its query string (Master Data
 * `_where` clauses). Passing `error` straight to the logger would carry all of
 * that into the log pipeline.
 *
 * This extracts what debugging actually needs and nothing else:
 *
 * - `message` / `code` / `status` — what failed and how.
 * - `vtexErrorCode` / `vtexErrorMessage` — the VTEX backend's own error
 *   contract (`{ error: { code, message } }`, or Master Data's `{ Message }`).
 * - `operationId` / `requestId` / `backend` — correlation ids most VTEX
 *   backends answer with (`x-vtex-operation-id`, `x-request-id`,
 *   `x-vtex-janus-router-backend-app`), verified against live responses. Hand
 *   these to the owning team and they can find the request on their side.
 * - `method` / `path` — the request line, with the query string stripped.
 * - `stack` — first lines only; code locations, never data.
 *
 * Free-text fields go through email redaction, since backend error messages
 * sometimes echo input back.
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const redact = (value: unknown): string | null =>
  typeof value === 'string'
    ? value.replace(EMAIL_PATTERN, '<redacted-email>')
    : null

const stripQuery = (url: unknown): string | null =>
  typeof url === 'string' ? url.split('?')[0] : null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const describeClientError = (error: any) => {
  if (error === null || error === undefined) {
    return null
  }

  if (typeof error === 'string') {
    return { message: redact(error) }
  }

  const headers = error?.response?.headers ?? {}
  const body = error?.response?.data
  const bodyError = body?.error

  return {
    backend: headers['x-vtex-janus-router-backend-app'] ?? null,
    code: error?.code ?? null,
    message: redact(error?.message),
    method: error?.config?.method ?? null,
    operationId:
      headers['x-vtex-operation-id'] ?? body?.operationId ?? null,
    path: stripQuery(error?.config?.url),
    requestId: headers['x-request-id'] ?? null,
    stack:
      typeof error?.stack === 'string'
        ? error.stack.split('\n').slice(0, 5).join('\n')
        : null,
    status: error?.response?.status ?? null,
    vtexErrorCode: bodyError?.code ?? headers['x-vtex-error-code'] ?? null,
    vtexErrorMessage: redact(bodyError?.message ?? body?.Message),
  }
}
