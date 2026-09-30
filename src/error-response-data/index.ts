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
 * Client-facing fields shared by JSON and ANSI responses. Defined `scope` and
 * `code` values must be nonblank; nonblank text is preserved exactly. Blank
 * optional public details are omitted. The shape excludes status, request ID,
 * metadata, attributes, cause, stack, and error name. `message` must contain
 * non-whitespace text. Use `parseErrorResponseData` from `@vercel/error/client`
 * before using unknown data.
 */
export interface ErrorResponseData {
  readonly error: {
    /** Nonblank client-visible namespace for the error. */
    readonly scope?: string;
    /** Nonblank client-visible stable error code. */
    readonly code?: string;
    /** Client-facing summary containing non-whitespace text. */
    readonly message: string;
    /** Client-facing explanation; blank text is omitted. */
    readonly reason?: string;
    /** Client-facing investigation advice; blank text is omitted. */
    readonly hint?: string;
    /** Client-facing recovery guidance; blank text is omitted. */
    readonly fix?: string;
    /** Client-facing documentation URL; blank text is omitted. */
    readonly link?: string;
  };
}

/**
 * Identity and nested public details accepted while building response data.
 */
interface PublicErrorInput {
  readonly scope?: string;
  readonly code?: string;
  readonly public: PublicErrorDetails;
}

/**
 * Values added during reconstruction. Set `statusCode` from the HTTP response;
 * the remaining options stay local to the reconstructed error.
 */
export type FromErrorResponseDataOptions = Pick<
  VercelErrorOptions,
  'statusCode' | 'cause' | 'requestId' | 'metadata' | 'attributes'
>;

/**
 * Build client-facing response data from a tagged error or explicit public input.
 *
 * Defined `scope` and `code` values must be nonblank. Invalid tagged values,
 * blank identity, and untagged values without nested `public` details throw.
 * Tagged errors without `public` use a generic message. Blank optional public
 * details are omitted, and nonblank values are preserved exactly. Each
 * response field is copied from the same property read that was checked.
 */
export function buildErrorResponseData(
  source: VercelErrorLike | PublicErrorInput,
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
 * Parse unknown data as `ErrorResponseData`.
 *
 * Returns `undefined` unless `data.error` has a nonblank string `message`,
 * nonblank `scope` and `code` when present, and string values for every known
 * optional field. Blank optional public details are omitted; nonblank text is
 * preserved exactly. Unknown fields are ignored. This checks field types, not
 * who produced the data or whether its guidance is safe. Property-access
 * exceptions propagate.
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
 * Reconstruct a `VercelError` from validated `ErrorResponseData`.
 *
 * Copies response fields to the matching developer and `public` fields.
 * `options` supplies status, cause, request ID, metadata, and attributes. Parse
 * unknown input first. Review the data before sending it to another audience or
 * following its guidance.
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

/** Read identity once each; validation and serialization use these copies. */
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
