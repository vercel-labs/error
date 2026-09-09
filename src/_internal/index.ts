import type { PublicErrorDetails } from '../types';

export function isObject(
  value: unknown,
): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const OPTIONAL_PUBLIC_DETAIL_FIELDS = [
  'reason',
  'hint',
  'fix',
  'link',
] as const;

type MutablePublicErrorDetails = {
  -readonly [K in keyof PublicErrorDetails]?: PublicErrorDetails[K];
} & { message: string };

/**
 * Read each public detail field once, validate the read value, and build a
 * fresh record from those same reads. Unknown fields are dropped and
 * explicitly `undefined` optional fields are omitted. Throws `TypeError` for
 * a missing or blank `message` or a non-string optional field.
 *
 * Shared by `VercelError` construction and response-data projection so the
 * two disclosure seams cannot drift.
 */
export function pickPublicErrorDetails(value: unknown): PublicErrorDetails {
  if (!isObject(value)) {
    throw new TypeError('Public error message must be a nonblank string');
  }

  const message = value['message'];
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new TypeError('Public error message must be a nonblank string');
  }

  const details: MutablePublicErrorDetails = { message };
  for (const field of OPTIONAL_PUBLIC_DETAIL_FIELDS) {
    const fieldValue = value[field];
    if (fieldValue === undefined) {
      continue;
    }
    if (typeof fieldValue !== 'string') {
      throw new TypeError(`${field} must be a string`);
    }
    details[field] = fieldValue;
  }
  return details;
}
