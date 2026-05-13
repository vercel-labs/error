import { describe, it, expect } from 'vitest';

import { isVercelError } from '.';
import { VERCEL_ERROR_TAG } from '../constants';
import { VercelError } from '../vercel-error';

describe('isVercelError', () => {
  it('returns true for VercelError instances', () => {
    expect(isVercelError(new VercelError('test'))).toBe(true);
  });

  it('returns true for VercelError subclasses', () => {
    class AppError extends VercelError {}
    expect(isVercelError(new AppError('test'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isVercelError(new Error('test'))).toBe(false);
  });

  it('returns false for non-errors', () => {
    expect(isVercelError(null)).toBe(false);
    expect(isVercelError(undefined)).toBe(false);
    expect(isVercelError('string')).toBe(false);
    expect(isVercelError({})).toBe(false);
  });

  it('detects cross-realm VercelError via global Symbol registry', () => {
    const crossRealmError = Object.create(Error.prototype);
    crossRealmError.message = 'cross-realm';
    Object.defineProperty(crossRealmError, VERCEL_ERROR_TAG, {
      value: true,
      enumerable: false,
    });
    expect(isVercelError(crossRealmError)).toBe(true);
  });

  it('rejects objects with tag set to non-true value', () => {
    const fake = Object.create(Error.prototype);
    Object.defineProperty(fake, VERCEL_ERROR_TAG, {
      value: 'yes',
      enumerable: false,
    });
    expect(isVercelError(fake)).toBe(false);
  });
});
