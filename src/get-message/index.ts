import { isObject } from '../_internal';
import { isErrorLike } from '../is-error-like';

/**
 * Extract a string from an unknown error value.
 *
 * Returns an error-like object's string `message`, then a string input, then
 * JSON for another non-array object. If object serialization throws, returns
 * `[ConstructorName - Unable to Stringify Error Object]`. Other values return
 * `fallback`, which defaults to `undefined`. Property access and Proxy traps
 * can still throw outside the guarded serialization step.
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
