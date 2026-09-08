import { runInNewContext } from 'node:vm';

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

  it('returns true for an Error from another realm', () => {
    expect(isError(runInNewContext('new Error("test")'))).toBe(true);
  });

  it('recognizes an Error that hides its toString tag', () => {
    const error = new Error('test');
    Object.defineProperty(error, Symbol.toStringTag, { value: 'Object' });

    expect(isError(error)).toBe(true);
  });

  it('rejects a plain object that forges the Error toString tag', () => {
    expect(isError({ [Symbol.toStringTag]: 'Error' })).toBe(false);
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

  it('returns false for a cyclic prototype Proxy', () => {
    let proxy: object;
    proxy = new Proxy(
      {},
      {
        getPrototypeOf: () => proxy,
      },
    );

    expect(isError(proxy)).toBe(false);
  });

  it('returns false for a Proxy whose getPrototypeOf trap throws', () => {
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('blocked');
        },
      },
    );

    expect(isError(proxy)).toBe(false);
  });

  it('does not follow an unbounded fresh prototype chain', () => {
    let prototypeReads = 0;
    const createProxy = (): object =>
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            prototypeReads += 1;
            if (prototypeReads > 50) throw new Error('prototype read limit');
            return createProxy();
          },
        },
      );

    expect(isError(createProxy())).toBe(false);
    expect(prototypeReads).toBeLessThan(5);
  });

  it('returns false for a revoked Proxy', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(isError(proxy)).toBe(false);
  });
});
