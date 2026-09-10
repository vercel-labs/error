import {
  isObject,
  OPTIONAL_PUBLIC_DETAIL_FIELDS,
  pickPublicErrorDetails,
} from '../_internal';
import { isError } from '../is-error';
import { isVercelError, isVercelErrorLikeData } from '../is-vercel-error';
import type {
  PublicErrorDetails,
  VercelErrorLike,
  VercelErrorOptions,
} from '../types';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

const GENERIC_PUBLIC_MESSAGE = 'An error occurred.';
const RESPONSE_IDENTITY_FIELDS = ['scope', 'code'] as const;

/**
 * Client-facing error identity and public details shared by JSON and ANSI
 * response bodies.
 *
 * This data excludes the concrete HTTP status, request ID, metadata,
 * attributes, cause, stack, and error name. `error.message` must contain
 * non-whitespace text. Pass unknown input to `parseErrorResponse` from
 * `@vercel/error/client` before reconstruction.
 *
 * Successful parsing confirms field shapes only. It does not establish where
 * the data came from or whether its recovery guidance should be followed.
 */
export interface ErrorResponseData {
  readonly error: {
    /** Client-visible namespace for the error. */
    readonly scope?: string;
    /** Client-visible stable error code. */
    readonly code?: string;
    /** Client-facing summary containing non-whitespace text. */
    readonly message: string;
    /** Client-facing explanation of why the error occurred. */
    readonly reason?: string;
    /** Client-facing investigation advice. */
    readonly hint?: string;
    /** Client-facing recovery guidance. */
    readonly fix?: string;
    /** Client-facing documentation URL. */
    readonly link?: string;
  };
}

/**
 * Public details and identity accepted while building response data.
 * Every text field is approved for clients. Optional fields set to `undefined`
 * are omitted.
 */
interface PublicErrorInput extends PublicErrorDetails {
  readonly scope?: string;
  readonly code?: string;
}

/**
 * Local values added when reconstructing an upstream response.
 *
 * `statusCode` should normally come from the observed HTTP response because
 * `ErrorResponseData` does not contain it. `cause`, `requestId`, `metadata`,
 * and `attributes` add debugging data owned by the receiving application.
 */
export type FromErrorResponseOptions = Pick<
  VercelErrorOptions,
  'statusCode' | 'cause' | 'requestId' | 'metadata' | 'attributes'
>;

/**
 * Build client-facing response data from an error or public input.
 *
 * Tagged values are checked before flat input. An invalid tagged value throws
 * instead of being treated as public data. Untagged values with `name` or
 * `stack` also throw. Errors without `public` details receive a fixed generic
 * message instead of the developer-facing message. Each response field is
 * copied from the same property read that was checked, so a getter cannot pass
 * validation with one value and return another.
 */
export function buildErrorResponseData(
  source: VercelErrorLike | PublicErrorInput,
): ErrorResponseData {
  if (!isObject(source)) {
    throw new TypeError(
      'Error response source must be public error input or VercelError-like data',
    );
  }

  if (VERCEL_ERROR_TAG in source) {
    if (!isVercelError(source) || !isVercelErrorLikeData(source)) {
      throw new TypeError(
        'Tagged VercelError-like data does not match the expected field types',
      );
    }

    const publicDetails = source.public;
    return {
      error: {
        ...pickResponseIdentity(source),
        ...(publicDetails === undefined
          ? { message: GENERIC_PUBLIC_MESSAGE }
          : pickPublicErrorDetails(publicDetails)),
      },
    };
  }

  if (isError(source) || hasErrorDiagnosticFields(source)) {
    throw new TypeError(
      'Untagged Error-like values cannot be serialized; pass explicit public input instead',
    );
  }

  const publicDetails = pickPublicErrorDetails(source);
  return {
    error: {
      ...pickResponseIdentity(source),
      ...publicDetails,
    },
  };
}

/**
 * Parse unknown data as `ErrorResponseData`.
 *
 * Returns `undefined` unless `data.error` is a non-array object with a nonblank
 * string `message` and every present known optional field is a string. Unknown
 * fields are ignored.
 *
 * Successful parsing confirms field shapes only. It does not establish where
 * the data came from or whether suggested actions should be performed.
 * Property reads may invoke accessors or Proxy traps; their exceptions
 * propagate instead of returning `undefined`.
 */
export function parseErrorResponse(
  data?: unknown,
): ErrorResponseData | undefined {
  if (!isObject(data) || !isObject(data['error'])) {
    return undefined;
  }

  const error = data['error'];
  const message = error['message'];
  if (typeof message !== 'string' || message.trim().length === 0) {
    return undefined;
  }

  const identity = parseStringFields(error, RESPONSE_IDENTITY_FIELDS);
  const details = parseStringFields(error, OPTIONAL_PUBLIC_DETAIL_FIELDS);
  if (identity === undefined || details === undefined) {
    return undefined;
  }

  return { error: { ...identity, message, ...details } };
}

/**
 * Reconstruct a `VercelError` from validated `ErrorResponseData`.
 *
 * Copies `scope` and `code` to the error identity. Copies `message`, `reason`,
 * `hint`, `fix`, and `link` to both the developer-facing fields and `public`, so
 * a later `errorResponse()` call includes the same client-facing data. `options`
 * supplies the status mapping, cause, request ID, metadata, and attributes.
 *
 * Pass unknown input through {@link parseErrorResponse} first. This function
 * does not establish where `data` came from. Review it before sending it to a
 * different audience or following its recovery guidance.
 */
export function fromErrorResponse(
  data: ErrorResponseData,
  options: FromErrorResponseOptions = {},
): VercelError {
  const { error } = data;

  return new VercelError(error.message, {
    ...options,
    code: error.code,
    fix: error.fix,
    hint: error.hint,
    link: error.link,
    public: pickPublicErrorDetails(error),
    reason: error.reason,
    scope: error.scope,
  });
}

function hasErrorDiagnosticFields(
  value: Record<PropertyKey, unknown>,
): boolean {
  return 'name' in value || 'stack' in value;
}

/**
 * Read `scope` and `code` once each and validate the read values.
 * Serialization uses only these copies, never a second property read.
 */
function pickResponseIdentity(source: {
  readonly scope?: unknown;
  readonly code?: unknown;
}): Pick<ErrorResponseData['error'], 'scope' | 'code'> {
  const identity: { scope?: string; code?: string } = {};
  for (const field of RESPONSE_IDENTITY_FIELDS) {
    const value = source[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      throw new TypeError(`${field} must be a string`);
    }
    identity[field] = value;
  }
  return identity;
}

/**
 * Copy string fields from already-validated response data. A present field
 * whose value is not a string rejects the whole value with `undefined`,
 * matching strict parsing.
 */
function parseStringFields<TField extends string>(
  source: Record<PropertyKey, unknown>,
  fields: readonly TField[],
): Partial<Record<TField, string>> | undefined {
  const result: Partial<Record<TField, string>> = {};
  for (const field of fields) {
    if (!(field in source)) {
      continue;
    }
    const value = source[field];
    if (typeof value !== 'string') {
      return undefined;
    }
    result[field] = value;
  }
  return result;
}
