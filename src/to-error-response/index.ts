import { isObject } from '../_internal';
import {
  buildErrorResponseData,
  type ErrorResponseData,
} from '../error-response-data';
import { formatError } from '../format/index';
import type { PublicErrorDetails, VercelErrorLike } from '../types';
import { wantsAnsi, type HeadersLike } from '../wants-ansi';

/**
 * Client-facing input used without a `VercelError`. `public` is required and
 * validated before its prose is included in the response. Defined `scope` and
 * `code` values must be nonblank. `statusCode` defaults to 500 and accepts
 * 400-599.
 */
export interface ErrorResponseInput {
  /** Optional nonblank error scope included in the response. */
  readonly scope?: string;
  /** Optional nonblank stable error code included in the response. */
  readonly code?: string;
  /** Status mapping; defaults to 500 or throws `RangeError` unless 400-599. */
  readonly statusCode?: number;
  /** Approved response details; `message` must be nonblank. */
  readonly public: PublicErrorDetails;
}

/** Options for body format and the `onSerialize` callback. */
export interface ErrorResponseOptions {
  /**
   * Request or headers used for body selection; omission uses JSON. When
   * supplied, the response includes `Vary: X-Error-Format, Accept, User-Agent`.
   */
  readonly request?: Request | HeadersLike;

  /**
   * Called with the original source after the response is built. Exceptions
   * propagate. Must return `undefined`; TypeScript rejects async callbacks.
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
 * HTTP response data returned by {@link errorResponse}. Pass these fields to a
 * native or framework response constructor. ANSI uses
 * `text/plain+ansi; charset=utf-8`; supplied request headers add `Vary`.
 */
export interface ErrorResponse {
  /** Concrete HTTP status to send. */
  readonly status: number;
  /** Serialized `ErrorResponseData` or ANSI text with the same public fields. */
  readonly body: string;
  /** Matching `Content-Type` and conditional `Vary` response headers. */
  readonly headers: Record<string, string>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const TEXT_HEADERS = {
  'Content-Type': 'text/plain+ansi; charset=utf-8',
} as const;
const VARY_HEADERS = {
  Vary: 'X-Error-Format, Accept, User-Agent',
} as const;

/**
 * Build HTTP response data from an error or explicit public data.
 *
 * `VercelError` and tagged values expose only `public`, `scope`, and `code`; a
 * missing `public` uses a generic message. Defined identity values must be
 * nonblank. Untagged errors and inputs without valid nested `public` details
 * throw `TypeError`.
 *
 * `statusCode` defaults to 500 and accepts integers from 400 through 599.
 * Invalid status throws `RangeError`; invalid public data throws `TypeError`.
 * With `request`, a present `X-Error-Format` is authoritative; only the exact
 * value `ansi` selects ANSI. Otherwise, an exact case-insensitive
 * `text/plain+ansi` Accept range selects ANSI for a valid positive quality
 * (omitted `q` means `1`). Duplicate exact ranges use the highest valid quality.
 * Exact ranges with only zero or invalid weights select JSON and skip the
 * User-Agent fallback. Only when the exact range is absent does the
 * case-sensitive `curl/` User-Agent marker select ANSI. Wildcards do not select
 * ANSI.
 * ANSI responses use `text/plain+ansi; charset=utf-8`; either representation
 * includes `Vary: X-Error-Format, Accept, User-Agent` when `request` is set.
 * Property-access exceptions propagate. `onSerialize` runs after the response
 * is built.
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
  const request = options.request;
  const bodyFormat = wantsAnsi(request) ? 'ansi' : 'json';

  const result: ErrorResponse =
    bodyFormat === 'ansi'
      ? {
          body: renderPublicError(responseData.error),
          headers: {
            ...TEXT_HEADERS,
            ...(request === undefined ? {} : VARY_HEADERS),
          },
          status,
        }
      : {
          body: JSON.stringify(responseData),
          headers: {
            ...JSON_HEADERS,
            ...(request === undefined ? {} : VARY_HEADERS),
          },
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
