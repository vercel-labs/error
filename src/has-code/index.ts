import { isObject } from '../_internal';

/**
 * Check an object's string `code` against one exact, case-sensitive value.
 * Accepts branded errors and plain non-array objects and narrows a match to the
 * supplied literal code. This structural check does not establish trust or
 * disclosure approval; property-access exceptions propagate.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  code: TCode,
): error is { code: TCode };

/**
 * Check an object's string `code` against exact, case-sensitive values.
 * A match narrows `code` to the union of list elements; an empty list never
 * matches. Plain non-array objects are accepted. This structural check does not
 * establish trust or disclosure approval; property-access exceptions propagate.
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
