import type { PublicErrorDetails } from '../types';

export function isObject(
  value: unknown,
): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeErrorIdentity(
  value: unknown,
  field: 'scope' | 'code',
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string`);
  }
  return value;
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
 * Copy known public fields, reading each once. Requires a nonblank `message`,
 * drops blank details, and rejects other invalid values.
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
    if (fieldValue.trim().length === 0) {
      continue;
    }
    details[field] = fieldValue;
  }
  return details;
}
