import { isObject } from '../_internal';
import { isErrorLike } from '../is-error-like';

/**
 * Safely extract a message from any error value.
 *
 * Handles Error instances, error-like objects, plain objects (JSON stringified),
 * strings, and unknown values with a configurable fallback.
 */
export function getMessage(
  error: unknown,
  fallback?: string,
): string | undefined {
  if (isErrorLike(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (isObject(error)) {
    try {
      return JSON.stringify(error);
    } catch {
      const constructorName =
        (error.constructor as { name?: string } | undefined)?.name ?? 'Object';
      return `[${constructorName} - Unable to Stringify Error Object]`;
    }
  }

  return fallback;
}
