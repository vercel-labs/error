import { isObject } from '../_internal';

/**
 * Follow `cause` fields on non-array objects to the last value. Missing causes
 * stop traversal; cycles return the first repeated object. Property-access
 * exceptions propagate.
 */
export function getRootCause(error: unknown): unknown {
  if (!isObject(error)) {
    return error;
  }

  const visited = new WeakSet<object>();
  let current: unknown = error;

  while (isObject(current) && 'cause' in current) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    const cause = current.cause;
    if (cause === undefined) {
      break;
    }
    current = cause;
  }

  return current;
}
