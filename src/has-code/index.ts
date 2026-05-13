import { isObject } from '../_internal';

/**
 * Check if an error has a specific error code.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  code: TCode,
): error is { code: TCode };

/**
 * Check if an error has any of the specified error codes.
 */
export function hasCode<TCode extends string>(
  error: unknown,
  codes: readonly TCode[],
): error is { code: TCode };

/**
 * Check if an error has a specific error code or any of the specified error codes.
 */
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
