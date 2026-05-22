import { describe, expect, it } from 'vitest';

import { isErrorLike } from '.';

describe('isErrorLike', () => {
  it('returns true for Error instances', () => {
    expect(isErrorLike(new Error('test'))).toBe(true);
  });

  it('returns true for objects with message string', () => {
    expect(isErrorLike({ message: 'something failed' })).toBe(true);
  });

  it('returns true for objects with message and name', () => {
    expect(isErrorLike({ message: 'fail', name: 'CustomError' })).toBe(true);
  });

  it('returns false when message is not a string', () => {
    expect(isErrorLike({ message: 123 })).toBe(false);
  });

  it('returns false for objects without message', () => {
    expect(isErrorLike({ error: 'something' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isErrorLike(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isErrorLike(undefined)).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isErrorLike('error')).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isErrorLike(['error'])).toBe(false);
  });
});
