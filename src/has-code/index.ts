import { isObject } from '../_internal';

/**
 * Match a non-array object's string `code` exactly and case-sensitively, then
 * narrow to `{ code: TCode }`. Property-access exceptions propagate.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  code: TCode,
): error is { code: TCode };

/**
 * Match a non-array object's string `code` against a list and narrow to the
 * matching union. Matching is exact and case-sensitive; an empty list never
 * matches. Property-access exceptions propagate.
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
