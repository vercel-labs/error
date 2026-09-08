import { isObject } from '../_internal';
import type { PublicErrorDetails, VercelErrorLike } from '../types';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

/**
 * Check whether a value is a local VercelError instance or valid tagged
 * cross-realm VercelErrorLike data.
 *
 * Uses a dual-strategy approach for reliable cross-realm detection:
 * 1. Fast path: `instanceof` check for same-realm objects
 * 2. Fallback: stable tag plus structural validation for cross-realm data
 *
 * The tag is forgeable. A successful check does not authenticate the producer,
 * authorize disclosure, or make class methods safe to invoke. Use
 * `instanceof VercelError` when local class behavior is required.
 */
export function isVercelError(error: unknown): error is VercelErrorLike {
  if (error instanceof VercelError) {
    return true;
  }

  return (
    isObject(error) &&
    VERCEL_ERROR_TAG in error &&
    error[VERCEL_ERROR_TAG] === true &&
    isVercelErrorLikeData(error)
  );
}

/** @internal Validate the data fields consumed from a tagged value. */
export function isVercelErrorLikeData(
  error: unknown,
): error is VercelErrorLike {
  return (
    isObject(error) &&
    typeof error['message'] === 'string' &&
    isOptionalString(error['name']) &&
    isOptionalString(error['stack']) &&
    isOptionalString(error['code']) &&
    isOptionalString(error['scope']) &&
    isOptionalNumber(error['statusCode']) &&
    isOptionalString(error['reason']) &&
    isOptionalString(error['hint']) &&
    isOptionalString(error['fix']) &&
    isOptionalString(error['link']) &&
    isOptionalString(error['requestId']) &&
    (error['public'] === undefined || isPublicErrorDetails(error['public'])) &&
    (error['metadata'] === undefined || isObject(error['metadata'])) &&
    (error['attributes'] === undefined || isObject(error['attributes']))
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

function isPublicErrorDetails(value: unknown): value is PublicErrorDetails {
  return (
    isObject(value) &&
    typeof value['message'] === 'string' &&
    isOptionalString(value['reason']) &&
    isOptionalString(value['hint']) &&
    isOptionalString(value['fix']) &&
    isOptionalString(value['link'])
  );
}
