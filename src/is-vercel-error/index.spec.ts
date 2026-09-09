import { describe, expect, it } from 'vitest';

import { isVercelError } from '.';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

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
      enumerable: false,
      value: true,
    });
    expect(isVercelError(crossRealmError)).toBe(true);
  });

  it('rejects objects with tag set to non-true value', () => {
    const fake = Object.create(Error.prototype);
    Object.defineProperty(fake, VERCEL_ERROR_TAG, {
      enumerable: false,
      value: 'yes',
    });
    expect(isVercelError(fake)).toBe(false);
  });

  it.each([
    {},
    { message: 123 },
    { message: 'error', statusCode: '500' },
    { message: 'error', public: {} },
    { message: 'error', metadata: [] },
    { message: 'error', attributes: [] },
  ])('rejects a tagged value with an invalid data shape: %o', (fields) => {
    const fake = { ...fields, [VERCEL_ERROR_TAG]: true };
    expect(isVercelError(fake)).toBe(false);
  });

  it('accepts a forged but valid cross-realm data contract', () => {
    const fake = {
      attributes: { retryable: true },
      code: 'timeout',
      message: 'Timed out',
      metadata: { attempt: 2 },
      public: { message: 'Please try again' },
      scope: 'api',
      statusCode: 504,
      [VERCEL_ERROR_TAG]: true,
    };

    expect(isVercelError(fake)).toBe(true);
  });
});
