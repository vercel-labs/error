import { isObject } from '../_internal';

/**
 * Get a message string from an unknown value.
 *
 * Returns a string input unchanged. For a non-array object, returns its string
 * `message` when present; otherwise returns `JSON.stringify(error)`, which may
 * be `undefined`. If serialization throws, returns
 * `[ConstructorName - JSON serialization failed]`. A failed constructor lookup
 * uses `Object`.
 *
 * Other values return `fallback`, which defaults to `undefined`. Checking or
 * reading `message` may invoke accessors or Proxy traps; their exceptions
 * propagate.
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
      return `[${constructorName} - JSON serialization failed]`;
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
