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
 * A present `X-Error-Format` is authoritative; only the exact value `ansi`
 * selects ANSI. Otherwise, a case-insensitive exact `text/plain+ansi` media
 * range in `Accept` selects ANSI when its valid `q` value is positive (the
 * default is `1`). Duplicate exact ranges use the highest valid quality.
 * If exact ranges have only zero or invalid weights, JSON wins and the
 * User-Agent fallback is skipped. If the exact range is absent, the
 * case-sensitive `curl/` marker selects ANSI. Wildcards do not select ANSI.
 * Missing input or no match returns `false`; header-access exceptions propagate.
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

  const acceptSelection = getAcceptAnsiSelection(headers.get('accept'));
  if (acceptSelection !== undefined) {
    return acceptSelection;
  }

  const userAgent = headers.get('user-agent');
  if (userAgent?.includes('curl/')) {
    return true;
  }

  return false;
}

const ANSI_MEDIA_TYPE = 'text/plain+ansi';
const QUALITY_VALUE = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

function getAcceptAnsiSelection(accept: string | null): boolean | undefined {
  if (accept === null) {
    return undefined;
  }

  let foundExactRange = false;
  let highestQuality = 0;
  for (const range of splitOutsideQuotes(accept, ',')) {
    const [mediaType, ...parameters] = splitOutsideQuotes(range, ';');
    if (
      mediaType === undefined ||
      mediaType.trim().toLowerCase() !== ANSI_MEDIA_TYPE
    ) {
      continue;
    }

    foundExactRange = true;
    const quality = getRangeQuality(parameters);
    if (quality !== undefined) {
      highestQuality = Math.max(highestQuality, quality);
    }
  }

  return foundExactRange ? highestQuality > 0 : undefined;
}

function getRangeQuality(parameters: readonly string[]): number | undefined {
  let hasQuality = false;
  let quality = 1;

  for (const parameter of parameters) {
    const separator = parameter.indexOf('=');
    const name =
      separator === -1
        ? parameter.trim().toLowerCase()
        : parameter.slice(0, separator).trim().toLowerCase();
    if (name !== 'q') {
      continue;
    }
    if (hasQuality || separator === -1) {
      return undefined;
    }

    hasQuality = true;
    const value = parameter.slice(separator + 1).trim();
    if (!QUALITY_VALUE.test(value)) {
      return undefined;
    }
    quality = Number(value);
  }

  return quality;
}

function splitOutsideQuotes(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === delimiter && !quoted) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
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
