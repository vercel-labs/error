import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

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

  describe('without Error.isError (fallback runtimes)', () => {
    /** Reload the module with the builtin hidden so the fallback is captured. */
    async function importFallbackIsError(): Promise<typeof isError> {
      const errorConstructor = Error as ErrorConstructor & {
        isError?: unknown;
      };
      const native = errorConstructor.isError;
      errorConstructor.isError = undefined;
      vi.resetModules();
      try {
        const module = await import('.');
        return module.isError;
      } finally {
        errorConstructor.isError = native;
        vi.resetModules();
      }
    }

    it('recognizes same-realm and cross-realm errors', async () => {
      const fallbackIsError = await importFallbackIsError();

      expect(fallbackIsError(new Error('test'))).toBe(true);
      expect(fallbackIsError(new TypeError('test'))).toBe(true);
      expect(fallbackIsError(runInNewContext('new Error("other realm")'))).toBe(
        true,
      );
    });

    it('rejects non-errors and primitives', async () => {
      const fallbackIsError = await importFallbackIsError();

      expect(fallbackIsError({})).toBe(false);
      expect(fallbackIsError({ message: 'error-like' })).toBe(false);
      expect(fallbackIsError('error')).toBe(false);
      expect(fallbackIsError(null)).toBe(false);
      expect(fallbackIsError(undefined)).toBe(false);
    });

    it('accepts a Symbol.toStringTag forgery, the documented degradation', async () => {
      const fallbackIsError = await importFallbackIsError();
      const forged = { [Symbol.toStringTag]: 'Error' };

      // The structural fallback cannot distinguish this forgery; the native
      // brand check rejects it. Client-safe serialization never depends on
      // this guard, so the degradation affects classification only.
      expect(fallbackIsError(forged)).toBe(true);
      expect(isError(forged)).toBe(false);
    });
  });
});
