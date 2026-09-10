import { isObject } from '../_internal';
import {
  buildErrorResponseData,
  type ErrorResponseData,
} from '../error-response-data';
import { formatError } from '../format/index';
import type { PublicErrorDetails, VercelErrorLike } from '../types';
import { wantsAnsi, type HeadersLike } from '../wants-ansi';

/**
 * Client-facing input for callers that do not have a `VercelError`. The
 * response includes `scope`, `code`, every text field, and the HTTP status.
 * `statusCode` defaults to 500 and must be an integer from 400 through 599;
 * {@link errorResponse} throws `RangeError` otherwise. Optional fields set to
 * `undefined` are omitted.
 */
export interface ErrorResponseInput extends PublicErrorDetails {
  /** Optional error scope included in the response. */
  readonly scope?: string;
  /** Optional stable error code included in the response. */
  readonly code?: string;
  /**
   * Authored HTTP status mapping. Omission defaults to 500; only integers from
   * 400 through 599 are accepted.
   */
  readonly statusCode?: number;
}

/** Options for selecting the body format and observing serialization. */
export interface ErrorResponseOptions {
  /**
   * Request or headers used to select the body format. Omission uses JSON. A
   * present `X-Error-Format` is checked first, followed by `Accept`, then the
   * `User-Agent` curl check; see {@link wantsAnsi}.
   */
  readonly request?: Request | HeadersLike;

  /**
   * Called synchronously after the complete `ErrorResponse` is built.
   *
   * The callback receives the original source, not response data, so it may
   * include developer-facing fields and debugging context. If the callback
   * throws, `errorResponse()` throws instead of returning the response. The
   * callback must return `undefined`, so TypeScript rejects async callbacks.
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
 * Complete HTTP response data returned by {@link errorResponse}. The body is
 * already serialized. Pass `body`, `status`, and `headers` to a native or
 * framework response constructor.
 */
export interface ErrorResponse {
  /** Concrete HTTP status to send. */
  readonly status: number;
  /**
   * JSON-serialized `ErrorResponseData` or ANSI-formatted text containing the
   * same error identity and public details.
   */
  readonly body: string;
  /**
   * Response headers containing the `Content-Type` that matches `body`:
   * `application/json` or `text/plain; charset=utf-8`.
   */
  readonly headers: Record<string, string>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' } as const;

/**
 * Build HTTP response data from an error or explicit public data.
 *
 * For local `VercelError` instances and tagged `VercelErrorLike` values,
 * response text comes only from `public`. If `public` is absent, the response
 * uses a fixed generic message. Untagged values recognized as errors, and
 * untagged objects with a `name` or `stack` field, throw `TypeError`. Other
 * untagged objects are treated as `ErrorResponseInput`, whose identity and text
 * are all client-visible.
 *
 * The response also includes `scope`, `code`, and the concrete HTTP status.
 * Header negotiation changes only the body format; callers must decide which
 * requester may receive those fields before calling this function.
 *
 * `statusCode` defaults to 500. Values that are not integers from 400 through
 * 599 throw `RangeError` before response data is built. Invalid tagged data or
 * public fields throw `TypeError`. Source accessors and Proxy traps may run and
 * throw. `onSerialize` runs only after the complete response is built, and its
 * exceptions propagate.
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
