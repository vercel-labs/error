import { describe, expect, it } from 'vitest';

import { getMessage } from '.';

describe('getMessage', () => {
  it('extracts message from Error', () => {
    expect(getMessage(new Error('test error'))).toBe('test error');
  });

  it('extracts message from error-like objects', () => {
    expect(getMessage({ message: 'custom error' })).toBe('custom error');
  });

  it('returns the same message value it validated', () => {
    let reads = 0;
    const error = {
      get message(): unknown {
        reads += 1;
        return reads === 1 ? 'stable message' : { changed: true };
      },
    };

    expect(getMessage(error)).toBe('stable message');
    expect(reads).toBe(1);
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

  it('uses Object when constructor lookup also throws', () => {
    const error: Record<string, unknown> = {};
    error['self'] = error;
    Object.defineProperty(error, 'constructor', {
      get() {
        throw new Error('constructor unavailable');
      },
    });

    expect(getMessage(error)).toBe(
      '[Object - Unable to Stringify Error Object]',
    );
  });

  it('uses the same constructor name value it validated', () => {
    let reads = 0;
    const error: Record<string, unknown> = {};
    error['self'] = error;
    error['constructor'] = {
      get name(): unknown {
        reads += 1;
        return reads === 1 ? 'StableError' : { changed: true };
      },
    };

    expect(getMessage(error)).toBe(
      '[StableError - Unable to Stringify Error Object]',
    );
    expect(reads).toBe(1);
  });

  it('returns undefined when object serialization returns undefined', () => {
    expect(getMessage({ toJSON: () => undefined })).toBeUndefined();
  });
});
