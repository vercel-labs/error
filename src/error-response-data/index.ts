import {
  isObject,
  normalizeErrorIdentity,
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
 * Client-facing data for HTTP responses and other message channels. Contains
 * approved text and optional nonblank identity, but no status or diagnostics.
 * Parse unknown data before use.
 */
export interface ErrorResponseData {
  readonly error: {
    /** Stable error namespace. */
    readonly scope?: string;
    /** Stable error code. */
    readonly code?: string;
    /** Client-facing summary containing non-whitespace text. */
    readonly message: string;
    /** Why the error occurred. */
    readonly reason?: string;
    /** Investigation advice. */
    readonly hint?: string;
    /** Recovery step. */
    readonly fix?: string;
    /** Documentation URL. */
    readonly link?: string;
  };
}

/**
 * Caller-authored identity and recipient-approved text, without an HTTP status
 * mapping. Identity is also disclosed; approve it for the intended recipient.
 */
export interface ErrorResponseDataInput {
  /** Optional nonblank error scope, preserved without trimming. */
  readonly scope?: string;
  /** Optional nonblank stable error code, preserved without trimming. */
  readonly code?: string;
  /** Required approved details with a nonblank message. */
  readonly public: PublicErrorDetails;
}

/** Local context for a reconstructed error. Set `statusCode` from the HTTP response. */
export type FromErrorResponseDataOptions = Pick<
  VercelErrorOptions,
  'statusCode' | 'cause' | 'requestId' | 'metadata' | 'attributes'
>;

/**
 * Build a fresh plain response envelope from a valid tagged error or explicit
 * `public` input. Copies optional nonblank `scope` and `code` plus approved
 * `message`, `reason`, `hint`, `fix`, and `link` text. Omits blank optional
 * details and preserves other text. Tagged errors without `public` use
 * `An error occurred.`; untagged input requires `public`.
 *
 * Excludes developer details, name, stack, cause, request ID, metadata,
 * attributes, HTTP status fields, and unknown public fields. It does not select
 * or range-check HTTP status, though tagged validation requires a numeric
 * `statusCode` when set.
 *
 * Throws `TypeError` for non-object input, invalid identity or public details,
 * malformed tagged data, untagged Error-like values (including objects with
 * `name` or `stack`), or untagged input without `public`. A top-level `message`
 * never supplies public text.
 *
 * Does not write to the source, report, perform I/O, or call source methods.
 * Getters and Proxy traps can run; their errors propagate. The output is
 * mutable. The tag and valid shape do not establish producer
 * trust or authorize recovery actions. Approve identity and text for each
 * audience.
 *
 * @example
 * const data = buildErrorResponseData({
 *   scope: 'roster',
 *   code: 'unavailable',
 *   public: { message: 'The roster is temporarily unavailable.' },
 * });
 */
export function buildErrorResponseData(
  source: VercelErrorLike | ErrorResponseDataInput,
): ErrorResponseData {
  if (!isObject(source)) {
    throw new TypeError(
      'Error response source must be tagged VercelError-like data or input with public details',
    );
  }

  if (VERCEL_ERROR_TAG in source) {
    const identityValues = readResponseIdentity(source);
    const identitySource = withResponseIdentitySnapshot(source, identityValues);
    if (
      !isVercelError(identitySource) ||
      !isVercelErrorLikeData(identitySource)
    ) {
      throw new TypeError(
        'Tagged VercelError-like data does not match the expected field types',
      );
    }

    const identity = normalizeResponseIdentity(identityValues);
    const publicDetails = source.public;
    return {
      error: {
        ...identity,
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

  const publicValue = source.public;
  if (publicValue === undefined) {
    throw new TypeError(
      'Untagged error response input must provide public details',
    );
  }
  const publicDetails = pickPublicErrorDetails(publicValue);
  const identity = normalizeResponseIdentity(readResponseIdentity(source));
  return {
    error: {
      ...identity,
      ...publicDetails,
    },
  };
}

/**
 * Parse unknown response data. Requires a nonblank `message`, and nonblank
 * `scope` and `code` when present. Returns `undefined` for invalid known fields;
 * ignores unknown fields and omits blank optional details. Valid shape does not
 * establish who sent the data. Getter errors propagate.
 */
export function parseErrorResponseData(
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
  if (
    identity === undefined ||
    !hasNonblankIdentity(identity) ||
    details === undefined
  ) {
    return undefined;
  }

  const publicDetails = pickPublicErrorDetails({ message, ...details });
  return { error: { ...identity, ...publicDetails } };
}

/**
 * Rebuild a `VercelError` from parsed response data. Options add local status
 * and context. Review received guidance before acting on it.
 */
export function fromErrorResponseData(
  data: ErrorResponseData,
  options: FromErrorResponseDataOptions = {},
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

interface ResponseIdentityValues {
  readonly scope: unknown;
  readonly code: unknown;
}

function readResponseIdentity(source: {
  readonly scope?: unknown;
  readonly code?: unknown;
}): ResponseIdentityValues {
  const scope = source.scope;
  const code = source.code;
  return { scope, code };
}

function normalizeResponseIdentity(
  values: ResponseIdentityValues,
): Pick<ErrorResponseData['error'], 'scope' | 'code'> {
  const identity: { scope?: string; code?: string } = {};
  for (const field of RESPONSE_IDENTITY_FIELDS) {
    const value = normalizeErrorIdentity(values[field], field);
    if (value !== undefined) {
      identity[field] = value;
    }
  }
  return identity;
}

/** Show validators the captured identity; other getters keep the source as `this`. */
function withResponseIdentitySnapshot(
  source: Record<PropertyKey, unknown>,
  identity: ResponseIdentityValues,
): Record<PropertyKey, unknown> {
  return new Proxy(source, {
    get(target, field) {
      if (field === 'scope' || field === 'code') {
        return identity[field];
      }
      return Reflect.get(target, field, target);
    },
  });
}

function hasNonblankIdentity(
  identity: Partial<Record<(typeof RESPONSE_IDENTITY_FIELDS)[number], string>>,
): boolean {
  for (const field of RESPONSE_IDENTITY_FIELDS) {
    const value = identity[field];
    if (value !== undefined && value.trim().length === 0) {
      return false;
    }
  }
  return true;
}

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
