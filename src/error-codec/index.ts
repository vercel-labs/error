import { isObject } from '../_internal';
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
const OPTIONAL_RESPONSE_ERROR_FIELDS = [
  'scope',
  'code',
  'reason',
  'hint',
  'fix',
  'link',
] as const;

/**
 * Normalized structured data for client-facing Vercel HTTP errors.
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
 * Flat, explicitly public input for callers that do not have a VercelError.
 *
 * Every prose field is treated as approved for client disclosure. `statusCode`
 * is an authored HTTP mapping; {@link errorResponse} validates it and returns
 * the concrete value as `status`. Explicitly `undefined` optional fields are
 * omitted from the projected response.
 */
export interface ErrorResponseInput extends PublicErrorDetails {
  readonly scope?: string;
  readonly code?: string;
  readonly statusCode?: number;
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
 * rejected instead of being reinterpreted as explicitly public data. Errors
 * without a `public` projection receive a fixed generic message; developer
 * prose is never used as a fallback.
 */
export function buildErrorResponseData(
  source: VercelErrorLike | ErrorResponseInput,
): ErrorResponseData {
  if (!isObject(source)) {
    throw new TypeError(
      'Error response source must be ErrorResponseInput or VercelError-like data',
    );
  }

  if (VERCEL_ERROR_TAG in source) {
    if (!isVercelError(source) || !isVercelErrorLikeData(source)) {
      throw new TypeError(
        'Tagged VercelError-like data does not match the expected field types',
      );
    }

    const publicDetails = source.public;
    if (publicDetails === undefined) {
      return {
        error: buildResponseError(source, { message: GENERIC_PUBLIC_MESSAGE }),
      };
    }

    assertPublicErrorDetails(publicDetails);
    return {
      error: buildResponseError(source, publicDetails),
    };
  }

  if (LEGACY_VERCEL_ERROR_TAG in source) {
    throw new TypeError(
      'VercelError values from 0.0.x cannot be serialized; recreate the error with explicit public details',
    );
  }

  if (isError(source) || hasErrorDiagnosticFields(source)) {
    throw new TypeError(
      'Untagged Error-like values cannot be serialized; pass ErrorResponseInput instead',
    );
  }

  assertPublicErrorDetails(source);
  assertOptionalStrings(source, ['scope', 'code']);

  return {
    error: selectResponseErrorFields(source),
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
  if (
    typeof error['message'] !== 'string' ||
    error['message'].trim().length === 0 ||
    !hasValidOptionalResponseErrorFields(error)
  ) {
    return undefined;
  }

  return {
    error: selectResponseErrorFields(error as ErrorResponseData['error']),
  };
}

/**
 * Reconstruct a VercelError from validated upstream ErrorResponseData.
 *
 * Client-facing response prose becomes both developer-facing context and the
 * new public projection. Identity and prose come from the response data;
 * status, cause, request ID, metadata, and attributes remain owned by the
 * caller. Reconstruction does not establish producer trust or authorize
 * following response fixes and links.
 */
export function fromErrorResponse(
  data: ErrorResponseData,
  options: FromErrorResponseOptions = {},
): VercelError {
  const { error } = data;
  const publicDetails: PublicErrorDetails = selectPublicErrorDetails(error);

  return new VercelError(error.message, {
    ...options,
    code: error.code,
    fix: error.fix,
    hint: error.hint,
    link: error.link,
    public: publicDetails,
    reason: error.reason,
    scope: error.scope,
  });
}

function assertPublicErrorDetails(
  value: unknown,
): asserts value is PublicErrorDetails {
  if (
    !isObject(value) ||
    typeof value['message'] !== 'string' ||
    value['message'].trim().length === 0
  ) {
    throw new TypeError('Public error message must be a nonblank string');
  }

  assertOptionalStrings(value, ['reason', 'hint', 'fix', 'link']);
}

function hasErrorDiagnosticFields(
  value: Record<PropertyKey, unknown>,
): boolean {
  return 'name' in value || 'stack' in value;
}

function assertOptionalStrings(
  value: Record<PropertyKey, unknown>,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new TypeError(`${field} must be a string`);
    }
  }
}

function hasValidOptionalResponseErrorFields(
  value: Record<PropertyKey, unknown>,
): boolean {
  return OPTIONAL_RESPONSE_ERROR_FIELDS.every(
    (field) => !(field in value) || typeof value[field] === 'string',
  );
}

function buildResponseError(
  source: Pick<VercelErrorLike, 'scope' | 'code'>,
  details: PublicErrorDetails,
): ErrorResponseData['error'] {
  return {
    ...(source.scope !== undefined ? { scope: source.scope } : {}),
    ...(source.code !== undefined ? { code: source.code } : {}),
    ...selectPublicErrorDetails(details),
  };
}

function selectResponseErrorFields(
  source: ErrorResponseData['error'] | ErrorResponseInput,
): ErrorResponseData['error'] {
  return {
    ...(source.scope !== undefined ? { scope: source.scope } : {}),
    ...(source.code !== undefined ? { code: source.code } : {}),
    ...selectPublicErrorDetails(source),
  };
}

function selectPublicErrorDetails(
  source: PublicErrorDetails,
): PublicErrorDetails {
  return {
    message: source.message,
    ...(source.reason !== undefined ? { reason: source.reason } : {}),
    ...(source.hint !== undefined ? { hint: source.hint } : {}),
    ...(source.fix !== undefined ? { fix: source.fix } : {}),
    ...(source.link !== undefined ? { link: source.link } : {}),
  };
}
