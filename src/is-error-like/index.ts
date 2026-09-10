import { isObject } from '../_internal';
import type { ErrorLike } from '../types';

/**
 * Return `true` for a non-array object whose own or inherited `message` is a
 * string, including an empty string. Does not check `name`, `stack`, or whether
 * the object is an `Error` instance. Property accessors and Proxy traps may run
 * and throw.
 */
export function isErrorLike(error: unknown): error is ErrorLike {
  return (
    isObject(error) && 'message' in error && typeof error.message === 'string'
  );
}
