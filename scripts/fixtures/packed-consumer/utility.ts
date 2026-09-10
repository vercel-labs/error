import { hasCode } from '@vercel/error';

export function isUnavailable(error: unknown): boolean {
  return hasCode(error, 'unavailable');
}
