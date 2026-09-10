/**
 * Minimal header lookup interface accepted by ANSI content negotiation.
 * Compatible with `Headers`, Next.js `ReadonlyHeaders`, and plain adapters.
 *
 * Negotiation looks up lowercase header names (`x-error-format`, `accept`,
 * `user-agent`), so `get` must match names case-insensitively, as WHATWG
 * `Headers` does. An adapter that only matches verbatim keys will miss
 * headers stored in other casings.
 */
export interface HeadersLike {
  get(name: string): string | null;
}

/**
 * Return whether a request selects an ANSI-formatted error response.
 *
 * Accepts a `Request` or a `HeadersLike` lookup. Checks these case-sensitive
 * values in order:
 *
 * 1. If `X-Error-Format` is present, return `true` only for the exact value
 *    `ansi`; do not check lower-priority headers.
 * 2. Return `true` if `Accept` contains `text/plain+ansi`.
 * 3. Return `true` if `User-Agent` contains `curl/`.
 *
 * Returns `false` when no input is provided or no check matches. Reading
 * headers or calling `get()` may invoke accessors or Proxy traps, and their
 * exceptions propagate.
 */
export function wantsAnsi(
  requestOrHeaders?: Request | HeadersLike | null,
): boolean {
  if (!requestOrHeaders) {
    return false;
  }

  const headers = _getHeadersLike(requestOrHeaders);

  const errorFormat = headers.get('x-error-format');
  if (errorFormat !== null) {
    return errorFormat === 'ansi';
  }

  const accept = headers.get('accept');
  if (accept?.includes('text/plain+ansi')) {
    return true;
  }

  const userAgent = headers.get('user-agent');
  if (userAgent?.includes('curl/')) {
    return true;
  }

  return false;
}

/**
 * If `input` has a `.headers` property with a `.get()` method, treat it as
 * a Request-like object and unwrap its headers. Otherwise assume `input`
 * itself is already a HeadersLike (e.g. `Headers`, `ReadonlyHeaders`).
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
