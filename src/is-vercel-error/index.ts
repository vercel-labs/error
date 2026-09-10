import { isObject } from '../_internal';
import type { PublicErrorDetails, VercelErrorLike } from '../types';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

/**
 * Return `true` for a local `VercelError` instance without revalidating its
 * fields. For other objects, require the package symbol tag and validate the
 * `VercelErrorLike` fields.
 *
 * Any object can forge the tag. For a non-local tagged object, `true` means only
 * that its fields have the expected runtime shapes; it does not establish where
 * the object came from or make developer-facing fields safe to send to clients.
 * Use `instanceof VercelError` before calling class methods.
 *
 * Tagged objects may have a blank `public.message`; `metadata` and `attributes`
 * may be any non-array objects. Property accessors and Proxy traps may run and
 * throw.
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

/**
 * Shape check for recognition only: a blank `message` passes here.
 * `error-response-data` separately enforces a nonblank message before any
 * value is disclosed, so the two validators are intentionally different.
 */
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
