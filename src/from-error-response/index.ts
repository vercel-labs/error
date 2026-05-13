import type { ErrorResponse, VercelErrorOptions } from '../types';
import { VercelError } from '../vercel-error';

/**
 * Additional options when reconstructing a VercelError from an ErrorResponse.
 * Fields already provided by the ErrorResponse (`code`, `reason`, `hint`,
 * `fix`, `link`, `userMessage`) are excluded — the wire values always win.
 */
export type FromErrorResponseOptions = Omit<
  VercelErrorOptions,
  'code' | 'reason' | 'hint' | 'fix' | 'link' | 'userMessage'
>;

/**
 * Reconstruct a VercelError from a validated ErrorResponse.
 *
 * Use this at service boundaries when you receive an error from an upstream
 * service and want to re-throw, enrich, or chain it as a VercelError.
 *
 * The ErrorResponse `message` becomes both the VercelError `message` and
 * `userMessage` (since it was already client-safe on the wire).
 *
 * @param response - A validated ErrorResponse (from `parseErrorResponse`)
 * @param options - Additional VercelError options (statusCode, cause, scope, etc.)
 *
 * @example
 * ```ts
 * import { parseErrorResponse, fromErrorResponse } from '@vercel/error/client';
 *
 * const res = await fetch('https://api.vercel.com/v1/deployments');
 * if (!res.ok) {
 *   const parsed = parseErrorResponse(await res.json());
 *   if (parsed) {
 *     throw fromErrorResponse(parsed, {
 *       statusCode: res.status,
 *       scope: 'upstream',
 *       cause: new Error(`${res.url} returned ${res.status}`),
 *     });
 *   }
 * }
 * ```
 */
export function fromErrorResponse(
  response: ErrorResponse,
  options: FromErrorResponseOptions = {},
): VercelError {
  return new VercelError(response.error.message, {
    ...options,
    code: response.error.code,
    userMessage: response.error.message,
    reason: response.error.reason,
    hint: response.error.hint,
    fix: response.error.fix,
    link: response.error.link,
  });
}
