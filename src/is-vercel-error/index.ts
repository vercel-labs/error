import { isObject } from '../_internal';
import { VERCEL_ERROR_TAG } from '../constants';
import { VercelError } from '../vercel-error';

/**
 * Check if a value is a VercelError instance.
 *
 * Uses a dual-strategy approach for reliable cross-realm detection:
 * 1. Fast path: `instanceof` check for same-realm objects
 * 2. Fallback: Symbol-based tag verification for cross-realm compatibility
 */
export function isVercelError(error: unknown): error is VercelError {
  if (error instanceof VercelError) {
    return true;
  }

  return (
    isObject(error) &&
    VERCEL_ERROR_TAG in error &&
    error[VERCEL_ERROR_TAG] === true
  );
}
