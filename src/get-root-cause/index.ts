import { isObject } from '../_internal';

/**
 * Traverse the error cause chain to find the root cause.
 *
 * Walks down the chain following `cause` properties until it finds a value
 * without a cause. Uses a `WeakSet` to detect cycles.
 */
export function getRootCause(error: unknown): unknown {
  if (!isObject(error) || !('cause' in error)) {
    return error;
  }

  const visited = new WeakSet<object>();
  let current: unknown = error;

  while (
    isObject(current) &&
    'cause' in current &&
    current.cause !== undefined
  ) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    current = current.cause;
  }

  return current;
}
