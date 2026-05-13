import { describe, it, expect } from 'vitest';

import { getMessage } from '.';

describe('getMessage', () => {
  it('extracts message from Error', () => {
    expect(getMessage(new Error('test error'))).toBe('test error');
  });

  it('extracts message from error-like objects', () => {
    expect(getMessage({ message: 'custom error' })).toBe('custom error');
  });

  it('returns string values as-is', () => {
    expect(getMessage('raw string')).toBe('raw string');
  });

  it('JSON stringifies plain objects', () => {
    expect(getMessage({ key: 'value' })).toBe('{"key":"value"}');
  });

  it('returns fallback for null', () => {
    expect(getMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns fallback for undefined', () => {
    expect(getMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns undefined when no fallback provided', () => {
    expect(getMessage(null)).toBeUndefined();
  });

  it('returns fallback for numbers', () => {
    expect(getMessage(42, 'fallback')).toBe('fallback');
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    const result = getMessage(obj);
    expect(result).toContain('Unable to Stringify');
  });
});
