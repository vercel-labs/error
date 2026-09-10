import { isObject } from '../_internal';
import type { ErrorLike } from '../types';

/**
 * Match a non-array object with a string `message`, including an empty string.
 * Does not check `name`, `stack`, or `Error` identity. Property-access
 * exceptions propagate.
 */
export function isErrorLike(error: unknown): error is ErrorLike {
  return (
    isObject(error) && 'message' in error && typeof error.message === 'string'
  );
}
