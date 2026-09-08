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
import { LEGACY_VERCEL_ERROR_TAG, VERCEL_ERROR_TAG } from '../vercel-error/tag';

const GENERIC_PUBLIC_MESSAGE = 'An error occurred.';
const RESPONSE_IDENTITY_FIELDS = ['scope', 'code'] as const;

/**
 * Normalized structured data for client-facing errors.
 *
 * The data feeds JSON serialization and ANSI rendering. It excludes status,
 * request ID, metadata, attributes, cause, stack, and developer name. Shape
 * validation does not authenticate the producer or authorize acting on its
 * prose, fixes, or links. `error.message` must be nonblank. Pass unknown input
 * through {@link parseErrorResponse} before reconstruction.
 */
export interface ErrorResponseData {
  readonly error: {
    readonly scope?: string;
    readonly code?: string;
    readonly message: string;
    readonly reason?: string;
    readonly hint?: string;
    readonly fix?: string;
    readonly link?: string;
  };
}

/**
 * Public details and identity accepted while building response data.
 * Every prose field is approved for client disclosure; explicitly `undefined`
 * optional fields are omitted.
 */
interface PublicErrorInput extends PublicErrorDetails {
  readonly scope?: string;
  readonly code?: string;
}

/**
 * Caller-owned context accepted while reconstructing an upstream response.
 * Response identity and prose always win and cannot be overridden here.
 */
export type FromErrorResponseOptions = Pick<
  VercelErrorOptions,
  'statusCode' | 'cause' | 'requestId' | 'metadata' | 'attributes'
>;

/**
 * Build normalized client-facing response data from an error or public input.
 *
 * Tagged values are classified before flat input. A tagged malformed value is
 * rejected instead of being reinterpreted as explicitly public data. Untagged
 * values carrying `name` or `stack` are treated as Error-like and rejected.
 * Errors without approved `public` details receive a fixed generic message;
 * developer prose is never used as a fallback. Every disclosed field is read
 * once, validated, and copied, so a getter cannot pass validation with one
 * value and serialize another; only validated strings reach the result.
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

  if (LEGACY_VERCEL_ERROR_TAG in source) {
    throw new TypeError(
      'VercelError values from 0.0.x cannot be serialized; recreate the error with explicit public details',
    );
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
 * Parse unknown data as the canonical ErrorResponseData shape.
 *
 * Unknown fields are ignored for additive compatibility. A missing or blank
 * message, or any present known field with the wrong type, rejects the entire
 * value and returns `undefined`. A parsed response remains untrusted data;
 * applications must authenticate its producer and authorize suggested actions.
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
 * Reconstruct a VercelError from validated upstream ErrorResponseData.
 *
 * Response identity populates `scope` and `code`. Response prose populates the
 * developer fields and is also stored under `public`, so a later
 * `errorResponse()` call sends that identity and prose again. Status, cause,
 * request ID, metadata, and attributes remain caller-owned. Validation does
 * not authenticate the producer, make the fields safe for another recipient,
 * or authorize following fixes and links.
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
