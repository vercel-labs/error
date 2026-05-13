import { isObject } from '../_internal';
import type { ErrorLike } from '../types';

/**
 * Check if a value is an error-like object (has a `message` string property).
 */
export function isErrorLike(error: unknown): error is ErrorLike {
  return (
    isObject(error) && 'message' in error && typeof error.message === 'string'
  );
}
