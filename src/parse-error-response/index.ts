import { isObject } from '../_internal';
import type { ErrorResponse } from '../types';

/**
 * Parse and validate unknown data as an ErrorResponse.
 *
 * Validates that `message` is a non-empty string.
 * Optional fields (`code`, `reason`, `hint`, `fix`, `link`) are included only if they are non-empty strings.
 *
 * @returns The validated ErrorResponse if valid, `undefined` otherwise.
 */
export function parseErrorResponse(data?: unknown): ErrorResponse | undefined {
  if (!data || !isObject(data) || !('error' in data) || !isObject(data.error)) {
    return undefined;
  }

  const { error } = data;

  if (typeof error.message !== 'string' || error.message.trim().length === 0) {
    return undefined;
  }

  const result: ErrorResponse = {
    error: {
      message: error.message,
    },
  };

  for (const key of ['code', 'reason', 'hint', 'fix', 'link'] as const) {
    const value = error[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      result.error[key] = value;
    }
  }

  return result;
}
