import { isObject } from '../_internal';
import {
  projectErrorResponse,
  type ErrorResponse,
  type ErrorResponseParams,
} from '../error-codec';
import { formatError } from '../format/index';
import type { VercelErrorLike } from '../types';
import { wantsAnsi, type HeadersLike } from '../wants-ansi';

/** Options for HTTP negotiation and serialization diagnostics. */
export interface ErrorResponseOptions {
  /** Request or headers used only to select JSON or ANSI representation. */
  readonly request?: Request | HeadersLike;

  /**
   * Synchronous diagnostics callback invoked after the response is complete.
   *
   * The original error is provided so trusted instrumentation can inspect
   * server-side context. Exceptions propagate and replace the response the
   * caller would otherwise receive. Async callbacks are rejected by the
   * `undefined` return type.
   */
  readonly onSerialize?: (
    error: VercelErrorLike | ErrorResponseParams,
    context: {
      readonly status: number;
      readonly representation: 'json' | 'ansi';
    },
  ) => undefined;
}

/** Complete framework-neutral HTTP response data. */
export interface ErrorResponseResult {
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
 * their `public` projection, or the fixed generic fallback when that projection
 * is absent. Any untagged object is treated as flat public params. Scope, code,
 * status, and every flat prose field are client-visible. Request headers select
 * a representation; they do not authorize access.
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
  error: VercelErrorLike | ErrorResponseParams,
  options: ErrorResponseOptions = {},
): ErrorResponseResult {
  const status = resolveStatus(error);
  const response = projectErrorResponse(error);
  const representation = wantsAnsi(options.request) ? 'ansi' : 'json';

  const result: ErrorResponseResult =
    representation === 'ansi'
      ? {
          body: renderPublicError(response.error),
          headers: { ...TEXT_HEADERS },
          status,
        }
      : {
          body: JSON.stringify(response),
          headers: { ...JSON_HEADERS },
          status,
        };

  options.onSerialize?.(error, { representation, status });
  return result;
}

function resolveStatus(error: VercelErrorLike | ErrorResponseParams): number {
  const value = isObject(error) ? error['statusCode'] : undefined;
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

function renderPublicError(error: ErrorResponse['error']): string {
  return formatError(error, { format: 'ansi' });
}
