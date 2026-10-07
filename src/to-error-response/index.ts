import { isObject } from '../_internal';
import {
  buildErrorResponseData,
  type ErrorResponseData,
  type ErrorResponseDataInput,
} from '../error-response-data';
import { formatError } from '../format/index';
import type { RecognizedVercelError } from '../types';
import { wantsAnsi, type HeadersLike } from '../wants-ansi';

/** Public input to `errorResponse()` when no recognized error is available. */
export interface ErrorResponseInput extends ErrorResponseDataInput {
  /** Status mapping; defaults to 500 or throws `RangeError` unless 400-599. */
  readonly statusCode?: number;
}

/** Options for format selection and the `onSerialize` callback. */
export interface ErrorResponseOptions {
  /** Headers for format selection. Defaults to JSON; adds `Vary` when supplied. */
  readonly request?: Request | HeadersLike;

  /**
   * Receives the same recognized error or explicit input after the response is
   * built. Runs synchronously, returns `undefined`, and propagates errors.
   */
  readonly onSerialize?: (
    source: RecognizedVercelError | ErrorResponseInput,
    context: {
      /** Concrete HTTP status selected for this response. */
      readonly status: number;
      /** `json` for a JSON body or `ansi` for ANSI-formatted text. */
      readonly bodyFormat: 'json' | 'ansi';
    },
  ) => undefined;
}

/** HTTP fields returned by {@link errorResponse} for a response constructor. */
export interface ErrorResponse {
  /** Concrete HTTP status to send. */
  readonly status: number;
  /** Serialized `ErrorResponseData` or ANSI text with the same public fields. */
  readonly body: string;
  /** `Content-Type` and, when a request is supplied, `Vary`. */
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
 * Build HTTP response fields from recognized errors or explicit `public` input.
 * - Body: approved text and optional `scope` and `code`. Recognized errors
 *   without `public` use a generic message; untagged input requires it.
 * - Status: 500 by default; only integers from 400 to 599 are allowed.
 * - Format: JSON by default; `request` selects ANSI via {@link wantsAnsi}.
 *
 * Invalid input throws `TypeError`; invalid status throws `RangeError`.
 */
export function errorResponse(
  source: RecognizedVercelError | ErrorResponseInput,
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

function resolveStatus(
  source: RecognizedVercelError | ErrorResponseInput,
): number {
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
