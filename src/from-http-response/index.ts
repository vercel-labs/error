import {
  fromErrorResponseData,
  parseErrorResponseData,
  type FromErrorResponseDataOptions,
} from '../error-response-data';
import type { VercelError } from '../vercel-error';

const DEFAULT_REQUEST_ID_HEADER = 'x-vercel-id';

/**
 * Local context added while reconstructing an error from a Web `Response`.
 *
 * `requestIdHeader` defaults to `x-vercel-id`. Pass another header name to
 * use an application-owned correlation ID, or `false` to skip header lookup.
 * An explicit `requestId` takes precedence over the response header. Browser
 * CORS rules may make a non-safelisted response header unavailable.
 */
export type FromHttpResponseOptions = Omit<
  FromErrorResponseDataOptions,
  'statusCode'
> & {
  readonly requestIdHeader?: string | false;
};

/**
 * Reconstruct a `VercelError` from a JSON Web `Response`.
 *
 * Returns `undefined` unless the response has a 400 through 599 status,
 * `application/json` content type, and valid `ErrorResponseData`. A candidate
 * response body is consumed even when its JSON or data shape is invalid. This
 * function does not report the error or create a fallback. Parsing validates
 * fields, not the producer or the authority of its guidance. An invalid custom
 * header name throws the `TypeError` produced by `Headers.get()`.
 *
 * @example
 * const error = await fromHttpResponse(response, {
 *   requestIdHeader: 'x-request-id',
 * });
 */
export async function fromHttpResponse(
  response: Response,
  options: FromHttpResponseOptions = {},
): Promise<VercelError | undefined> {
  if (response.status < 400 || response.status > 599) {
    return undefined;
  }

  if (!isJsonContentType(response.headers.get('content-type'))) {
    return undefined;
  }

  const {
    requestId: explicitRequestId,
    requestIdHeader = DEFAULT_REQUEST_ID_HEADER,
    ...localContext
  } = options;
  const requestId =
    explicitRequestId ??
    (requestIdHeader === false
      ? undefined
      : (response.headers.get(requestIdHeader) ?? undefined));

  const data = parseErrorResponseData(
    await response.json().catch(() => undefined),
  );
  if (data === undefined) {
    return undefined;
  }

  return fromErrorResponseData(data, {
    ...localContext,
    requestId,
    statusCode: response.status,
  });
}

function isJsonContentType(contentType: string | null): boolean {
  return (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
  );
}
