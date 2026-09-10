import { isObject } from '../_internal';
import type { ErrorLike } from '../types';

/**
 * Check whether a non-array object has an own or inherited string `message`.
 * Blank messages pass. This structural check does not establish Error branding
 * or producer trust and does not validate `name` or `stack`. Property access
 * may invoke accessors or Proxy traps, and their exceptions propagate.
 */
export function isErrorLike(error: unknown): error is ErrorLike {
  return (
    isObject(error) && 'message' in error && typeof error.message === 'string'
  );
}
