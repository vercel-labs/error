import { isObject } from '../_internal';

/**
 * Check if a value is a standard JavaScript Error object.
 *
 * Handles cross-realm errors where `Error` objects from different execution
 * contexts (iframes, web workers, VM contexts) may not pass `instanceof Error`.
 */
export function isError(error: unknown): error is Error {
  if (!isObject(error)) {
    return false;
  }

  if (error instanceof Error) {
    return true;
  }

  return walkPrototypeForError(error);
}

function walkPrototypeForError<T extends object>(error: T): boolean {
  if (Object.prototype.toString.call(error) === '[object Error]') {
    return true;
  }

  const prototype = Object.getPrototypeOf(error) as T | null;
  return prototype === null ? false : walkPrototypeForError(prototype);
}
