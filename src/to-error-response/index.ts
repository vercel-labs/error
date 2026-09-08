import { isObject } from '../_internal';
import {
  buildErrorResponseData,
  type ErrorResponseData,
} from '../error-response-data';
import { formatError } from '../format/index';
import type { PublicErrorDetails, VercelErrorLike } from '../types';
import { wantsAnsi, type HeadersLike } from '../wants-ansi';

/**
 * Flat, explicitly public input for callers that do not have a VercelError.
 * `scope`, `code`, every prose field, and the resulting concrete status are
 * client-visible disclosures. `statusCode` defaults to 500 and must be an
 * integer from 400 through 599; {@link errorResponse} throws `RangeError`
 * otherwise. Explicitly `undefined` optional fields are omitted from response
 * data.
 */
export interface ErrorResponseInput extends PublicErrorDetails {
  readonly scope?: string;
  readonly code?: string;
  readonly statusCode?: number;
}

/** Options for HTTP negotiation and serialization diagnostics. */
export interface ErrorResponseOptions {
  /**
   * Request or headers used to select the body format. Omission uses JSON. A
   * present `X-Error-Format` is authoritative, followed by `Accept`, then the
   * `User-Agent` curl heuristic; see {@link wantsAnsi}.
   */
  readonly request?: Request | HeadersLike;

  /**
   * Synchronous diagnostics callback invoked after the complete
   * `ErrorResponse` result is built.
   *
   * The callback receives the original source so server-side instrumentation
   * can inspect its context. The source retains its existing trust level.
   * Exceptions propagate and replace the response the caller would otherwise
   * receive. Async callbacks are rejected by the `undefined` return type.
   */
  readonly onSerialize?: (
    source: VercelErrorLike | ErrorResponseInput,
    context: {
      /** Concrete HTTP status selected for this response. */
      readonly status: number;
      /** `json` for a JSON body or `ansi` for ANSI-formatted text. */
      readonly bodyFormat: 'json' | 'ansi';
    },
  ) => undefined;
}

/**
 * Complete framework-neutral HTTP response returned by {@link errorResponse}.
 * The body is already serialized. Use `body`, `status`, and `headers` to
 * construct a native or framework response.
 */
export interface ErrorResponse {
  /** Concrete HTTP status to send. */
  readonly status: number;
  /** Serialized JSON or structured ANSI text body. */
  readonly body: string;
  /** Headers to pass to the response constructor. */
  readonly headers: Record<string, string>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' } as const;

/**
 * Build a framework-neutral HTTP response from an error or explicit public data.
 *
 * Local `VercelError` instances and tagged `VercelErrorLike` values expose only
 * their approved `public` details, or the fixed generic fallback when those
 * details are absent. Untagged native, cross-realm, and Error-shaped objects
 * (carrying `name` or `stack`) throw `TypeError`; other untagged objects are
 * treated as `ErrorResponseInput`.
 * Scope, code, status, and every flat prose field are client-visible. Request
 * headers select the body format; they do not authorize access.
 *
 * `statusCode` defaults to 500 and must be an integer from 400 through 599.
 * Status validation runs before projection and throws `RangeError` for invalid
 * values. Invalid tagged data or public fields throw `TypeError` during
 * projection. `onSerialize` runs synchronously only after the complete result
 * is built; its exceptions propagate.
 *
 * @example
 * ```ts
 * const result = errorResponse(error, {
 *   request,
 *   onSerialize: (source, context) => {
 *     recordSerialization(source, context);
 *   },
 * });
 * return new Response(result.body, result);
 * ```
 */
export function errorResponse(
  source: VercelErrorLike | ErrorResponseInput,
  options: ErrorResponseOptions = {},
): ErrorResponse {
  const status = resolveStatus(source);
  const responseData = buildErrorResponseData(source);
  const bodyFormat = wantsAnsi(options.request) ? 'ansi' : 'json';

  const result: ErrorResponse =
    bodyFormat === 'ansi'
      ? {
          body: renderPublicError(responseData.error),
          headers: { ...TEXT_HEADERS },
          status,
        }
      : {
          body: JSON.stringify(responseData),
          headers: { ...JSON_HEADERS },
          status,
        };

  options.onSerialize?.(source, { bodyFormat, status });
  return result;
}

function resolveStatus(source: VercelErrorLike | ErrorResponseInput): number {
  const value = isObject(source) ? source['statusCode'] : undefined;
  const status = value === undefined ? 500 : value;

  if (
    typeof status !== 'number' ||
    !Number.isInteger(status) ||
    status < 400 ||
    status > 599
  ) {
    throw new RangeError('statusCode must be an integer between 400 and 599');
  }

  return status;
}

function renderPublicError(error: ErrorResponseData['error']): string {
  return formatError(error, { format: 'ansi' });
}
