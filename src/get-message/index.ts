import { isObject } from '../_internal';

/**
 * Get a message string or fallback from an unknown value.
 *
 * Returns, in order, an object's string `message`, a string input, or the result
 * of `JSON.stringify` for another non-array object. Object serialization may
 * return `undefined`. If serialization throws, returns
 * `[ConstructorName - Unable to Stringify Error Object]`; failed constructor
 * lookup uses `Object`. Other values return `fallback`, which defaults to
 * `undefined`. Message accessors and Proxy traps may run and throw.
 */
export function getMessage(
  error: unknown,
  fallback?: string,
): string | undefined {
  if (typeof error === 'string') {
    return error;
  }

  if (isObject(error)) {
    if ('message' in error) {
      const message = error.message;
      if (typeof message === 'string') {
        return message;
      }
    }

    try {
      return JSON.stringify(error);
    } catch {
      const constructorName = getConstructorName(error);
      return `[${constructorName} - Unable to Stringify Error Object]`;
    }
  }

  return fallback;
}

function getConstructorName(error: Record<PropertyKey, unknown>): string {
  try {
    const constructor = error.constructor as { name?: unknown } | undefined;
    const name = constructor?.name;
    return typeof name === 'string' ? name : 'Object';
  } catch {
    return 'Object';
  }
}
