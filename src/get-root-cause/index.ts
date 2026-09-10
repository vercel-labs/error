import { isObject } from '../_internal';

/**
 * Follow `cause` fields on non-array objects to the last value. Missing causes
 * stop traversal; cycles return the first repeated object. Property-access
 * exceptions propagate.
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
