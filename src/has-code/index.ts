import { isObject } from '../_internal';

/**
 * Return `true` when a non-array object's own or inherited string `code`
 * matches `code` exactly and case-sensitively. A match narrows the object to
 * `{ code: TCode }`. Reading `code` may invoke accessors or Proxy traps, and
 * their exceptions propagate.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  code: TCode,
): error is { code: TCode };

/**
 * Return `true` when a non-array object's own or inherited string `code`
 * exactly matches one of `codes`, using case-sensitive comparisons. A match
 * narrows `code` to the union of the list elements; an empty list never
 * matches. Reading `code` may invoke accessors or Proxy traps, and their
 * exceptions propagate.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  codes: readonly TCode[],
): error is { code: TCode };

export function hasCode<TCode extends string>(
  error: unknown,
  codeOrCodes: TCode | readonly TCode[],
): error is { code: TCode } {
  if (
    !isObject(error) ||
    !('code' in error) ||
    typeof error.code !== 'string'
  ) {
    return false;
  }

  if (Array.isArray(codeOrCodes)) {
    return codeOrCodes.includes(error.code as TCode);
  }

  return error.code === codeOrCodes;
}
