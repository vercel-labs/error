import { describe, it, expect } from 'vitest';

import { hasCode } from '.';
import { VercelError } from '../vercel-error';

describe('hasCode', () => {
  it('returns true when error has matching code', () => {
    const error = new VercelError('fail', { code: 'rate_limited' });
    expect(hasCode(error, 'rate_limited')).toBe(true);
  });

  it('returns false when error has different code', () => {
    const error = new VercelError('fail', { code: 'rate_limited' });
    expect(hasCode(error, 'not_found')).toBe(false);
  });

  it('works with plain objects', () => {
    expect(hasCode({ code: 'test' }, 'test')).toBe(true);
  });

  it('returns false when no code property', () => {
    expect(hasCode({}, 'test')).toBe(false);
  });

  it('returns false when code is not a string', () => {
    expect(hasCode({ code: 123 }, '123')).toBe(false);
  });

  it('accepts array of codes', () => {
    const error = new VercelError('fail', { code: 'rate_limited' });
    expect(hasCode(error, ['rate_limited', 'not_found'] as const)).toBe(true);
    expect(hasCode(error, ['not_found', 'forbidden'] as const)).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(hasCode(null, 'test')).toBe(false);
    expect(hasCode(undefined, 'test')).toBe(false);
    expect(hasCode('string', 'test')).toBe(false);
  });
});
