/**
 * Header lookup used by {@link wantsAnsi}. `get` must ignore name casing and
 * return `null` when a header is absent.
 */
export interface HeadersLike {
  get(name: string): string | null;
}

/**
 * Return whether a request selects an ANSI-formatted error response.
 *
 * Checks exact, case-sensitive values in this order: `X-Error-Format` equal to
 * `ansi`, `Accept` containing `text/plain+ansi`, then `User-Agent` containing
 * `curl/`. A present `X-Error-Format` stops the later checks. Missing input or
 * no match returns `false`; header-access exceptions propagate.
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
