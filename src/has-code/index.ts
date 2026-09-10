import { isObject } from '../_internal';

/**
 * Return `true` when a non-array object's string `code` exactly matches `code`,
 * using a case-sensitive comparison. A match narrows the object to
 * `{ code: TCode }`. This verifies the field, not who created the object or
 * whether the code may be disclosed. Property accessors and Proxy traps may run
 * and throw.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  code: TCode,
): error is { code: TCode };

/**
 * Return `true` when a non-array object's string `code` exactly matches one of
 * `codes`, using case-sensitive comparisons. A match narrows `code` to the
 * union of the list elements; an empty list never matches. This verifies the
 * field, not who created the object or whether the code may be disclosed.
 * Property accessors and Proxy traps may run and throw.
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
