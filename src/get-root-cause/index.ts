import { isObject } from '../_internal';

/**
 * Follow `cause` fields on arbitrary non-array objects to the root value.
 *
 * A missing or `undefined` cause stops traversal. Primitive and `null` causes
 * are returned directly. On a cycle, returns the first object encountered a
 * second time instead of throwing. Property access may invoke accessors or
 * Proxy traps, and their exceptions propagate.
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
