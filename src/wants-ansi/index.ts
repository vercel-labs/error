import type { HeadersLike } from '../types';

/**
 * Detect whether an HTTP request wants ANSI-formatted error responses.
 *
 * Accepts a `Request` or `HeadersLike` object: any object with a `get(name)` method
 * (e.g. Next.js `ReadonlyHeaders`, `Headers`, etc).
 *
 * Checks (in order):
 * 1. `X-Error-Format: ansi` header
 * 2. `Accept: text/plain+ansi` header
 * 3. `User-Agent` containing `curl/` (curl users get ANSI by default)
 *
 * Returns `false` if no input is provided or none of the checks match.
 */
export function wantsAnsi(
  requestOrHeaders?: Request | HeadersLike | null,
): boolean {
  if (!requestOrHeaders) return false;

  const headers = _getHeadersLike(requestOrHeaders);

  const errorFormat = headers.get('x-error-format');
  if (errorFormat === 'ansi') return true;

  const accept = headers.get('accept');
  if (accept?.includes('text/plain+ansi')) return true;

  const userAgent = headers.get('user-agent');
  if (userAgent?.includes('curl/')) return true;

  return false;
}

/**
 * Helper function to get a HeadersLike object from a Request or HeadersLike.
 *
 * If `input` has a `.headers` property with a `.get()` method, treat it as
 * a Request-like object and unwrap its headers.
 *
 * Otherwise assume `input` itself is already a HeadersLike (e.g. `Headers`, `ReadonlyHeaders`, etc).
 */
function _getHeadersLike(input: Request | HeadersLike): HeadersLike {
  if (
    'headers' in input &&
    typeof input.headers === 'object' &&
    input.headers !== null &&
    typeof (input.headers as HeadersLike).get === 'function'
  ) {
    return input.headers as HeadersLike;
  }
  return input as HeadersLike;
}
