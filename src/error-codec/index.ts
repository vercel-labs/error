import { isObject } from '../_internal';
import { isVercelError, isVercelErrorLikeData } from '../is-vercel-error';
import type {
  PublicErrorDetails,
  VercelErrorLike,
  VercelErrorOptions,
} from '../types';
import { VercelError } from '../vercel-error';
import { LEGACY_VERCEL_ERROR_TAG, VERCEL_ERROR_TAG } from '../vercel-error/tag';

const GENERIC_PUBLIC_MESSAGE = 'An error occurred.';
const OPTIONAL_WIRE_FIELDS = [
  'scope',
  'code',
  'reason',
  'hint',
  'fix',
  'link',
] as const;

/**
 * Canonical wire shape for client-facing Vercel HTTP errors.
 *
 * The body excludes status, request ID, metadata, attributes, cause, stack, and
 * developer name. Shape validation does not authenticate the producer or
 * authorize acting on its prose, fixes, or links.
 */
export interface ErrorResponse {
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
 * Explicitly public response data for callers that do not have a VercelError.
 *
 * Every prose field is treated as approved for client disclosure. `statusCode`
 * is an authored HTTP mapping; {@link errorResponse} validates it and returns
 * the concrete value as `status`.
 */
export interface ErrorResponseParams extends PublicErrorDetails {
  readonly scope?: string;
  readonly code?: string;
  readonly statusCode?: number;
}

/**
 * Caller-owned context accepted while reconstructing an upstream response.
 * Wire identity and prose always win and cannot be overridden here.
 */
export type FromErrorResponseOptions = Pick<
  VercelErrorOptions,
  'statusCode' | 'cause' | 'requestId' | 'metadata' | 'attributes'
>;

/**
 * Project an error into the canonical client-safe wire shape.
 *
 * Tagged values are classified before flat input. A tagged malformed value is
 * rejected instead of being reinterpreted as explicitly public data. Errors
 * without a `public` projection receive a fixed generic message; developer
 * prose is never used as a fallback.
 */
export function projectErrorResponse(
  source: VercelErrorLike | ErrorResponseParams,
): ErrorResponse {
  if (!isObject(source)) {
    throw new TypeError('Invalid error response source');
  }

  if (VERCEL_ERROR_TAG in source) {
    if (!isVercelError(source) || !isVercelErrorLikeData(source)) {
      throw new TypeError('Invalid VercelError-like value');
    }

    const publicDetails = source.public;
    if (publicDetails === undefined) {
      return {
        error: withIdentity(source, { message: GENERIC_PUBLIC_MESSAGE }),
      };
    }

    assertPublicErrorDetails(publicDetails);
    return {
      error: withIdentity(source, publicDetails),
    };
  }

  if (LEGACY_VERCEL_ERROR_TAG in source) {
    throw new TypeError('Invalid VercelError-like value');
  }

  assertPublicErrorDetails(source);
  assertOptionalStrings(source, ['scope', 'code']);

  return {
    error: copyWireFields(source),
  };
}

/**
 * Parse unknown data as the canonical ErrorResponse shape.
 *
 * Unknown fields are ignored for additive compatibility. A missing or blank
 * message, or any present known field with the wrong type, rejects the entire
 * value and returns `undefined`. A parsed response remains untrusted data;
 * applications must authenticate its producer and authorize suggested actions.
 */
export function parseErrorResponse(data?: unknown): ErrorResponse | undefined {
  if (!isObject(data) || !isObject(data['error'])) {
    return undefined;
  }

  const error = data['error'];
  if (
    typeof error['message'] !== 'string' ||
    error['message'].trim().length === 0 ||
    !hasOnlyValidKnownFields(error)
  ) {
    return undefined;
  }

  return {
    error: copyWireFields(error as ErrorResponse['error']),
  };
}

/**
 * Reconstruct a VercelError from a validated upstream ErrorResponse.
 *
 * Public wire prose becomes both developer-facing context and the new public
 * projection. Identity and prose come from the wire; status, cause, request ID,
 * metadata, and attributes remain owned by the caller. Reconstruction does not
 * establish producer trust or authorize following wire fixes and links.
 */
export function fromErrorResponse(
  response: ErrorResponse,
  options: FromErrorResponseOptions = {},
): VercelError {
  const { error } = response;
  const publicDetails: PublicErrorDetails = copyPublicDetails(error);

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

function assertOptionalStrings(
  value: Record<PropertyKey, unknown>,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (field in value && typeof value[field] !== 'string') {
      throw new TypeError(`${field} must be a string`);
    }
  }
}

function hasOnlyValidKnownFields(value: Record<PropertyKey, unknown>): boolean {
  return OPTIONAL_WIRE_FIELDS.every(
    (field) => !(field in value) || typeof value[field] === 'string',
  );
}

function withIdentity(
  source: Pick<VercelErrorLike, 'scope' | 'code'>,
  details: PublicErrorDetails,
): ErrorResponse['error'] {
  return {
    ...(source.scope !== undefined ? { scope: source.scope } : {}),
    ...(source.code !== undefined ? { code: source.code } : {}),
    ...copyPublicDetails(details),
  };
}

function copyWireFields(
  source: ErrorResponse['error'] | ErrorResponseParams,
): ErrorResponse['error'] {
  return {
    ...(source.scope !== undefined ? { scope: source.scope } : {}),
    ...(source.code !== undefined ? { code: source.code } : {}),
    ...copyPublicDetails(source),
  };
}

function copyPublicDetails(source: PublicErrorDetails): PublicErrorDetails {
  return {
    message: source.message,
    ...(source.reason !== undefined ? { reason: source.reason } : {}),
    ...(source.hint !== undefined ? { hint: source.hint } : {}),
    ...(source.fix !== undefined ? { fix: source.fix } : {}),
    ...(source.link !== undefined ? { link: source.link } : {}),
  };
}
