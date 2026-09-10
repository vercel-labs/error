import { describe, expect, it } from 'vitest';

import { getMessage } from '.';

describe('getMessage', () => {
  it('returns the message from an Error', () => {
    expect(getMessage(new Error('test error'))).toBe('test error');
  });

  it('returns the message from an object', () => {
    expect(getMessage({ message: 'custom error' })).toBe('custom error');
  });

  it('reads a string message accessor once', () => {
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

  it('returns a string unchanged', () => {
    expect(getMessage('raw string')).toBe('raw string');
  });

  it('returns JSON for a plain object', () => {
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

  it('returns the serialization fallback for a circular object', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(getMessage(obj)).toBe('[Object - JSON serialization failed]');
  });

  it.each([
    ['a missing constructor', undefined],
    ['a null constructor', null],
    ['a numeric constructor', 42],
    ['a symbol constructor', Symbol('constructor')],
    ['a non-string constructor name', { name: 42 }],
    [
      'a constructor name getter that throws',
      new Proxy(
        {},
        {
          get(_target, property) {
            if (property === 'name') throw new Error('name unavailable');
            return undefined;
          },
        },
      ),
    ],
  ])('uses Object for %s', (_label, constructor) => {
    const error: Record<string, unknown> = { constructor };
    error['self'] = error;

    expect(getMessage(error)).toBe('[Object - JSON serialization failed]');
  });

  it('uses Object when reading constructor throws', () => {
    const error: Record<string, unknown> = {};
    error['self'] = error;
    Object.defineProperty(error, 'constructor', {
      get() {
        throw new Error('constructor unavailable');
      },
    });

    expect(getMessage(error)).toBe('[Object - JSON serialization failed]');
  });

  it('reads constructor.name once for the serialization fallback', () => {
    let reads = 0;
    const error: Record<string, unknown> = {};
    error['self'] = error;
    error['constructor'] = {
      get name(): unknown {
        reads += 1;
        return reads === 1 ? 'StableError' : { changed: true };
      },
    };

    expect(getMessage(error)).toBe('[StableError - JSON serialization failed]');
    expect(reads).toBe(1);
  });

  it('returns undefined when object serialization returns undefined', () => {
    expect(getMessage({ toJSON: () => undefined })).toBeUndefined();
  });
});
