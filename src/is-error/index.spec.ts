import { describe, expect, it } from 'vitest';

import { isError } from '.';

describe('isError', () => {
  it('returns true for Error instances', () => {
    expect(isError(new Error('test'))).toBe(true);
  });

  it('returns true for TypeError', () => {
    expect(isError(new TypeError('test'))).toBe(true);
  });

  it('returns true for RangeError', () => {
    expect(isError(new RangeError('test'))).toBe(true);
  });

  it('returns false for null', () => {
    expect(isError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isError(undefined)).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isError('error')).toBe(false);
  });

  it('returns false for plain objects', () => {
    expect(isError({ message: 'test' })).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isError([1, 2, 3])).toBe(false);
  });
});
