import { describe, expect, it } from 'vitest';

import { VercelError } from '.';
import type { VercelErrorOptions } from '../types';
import { VERCEL_ERROR_TAG } from './tag';

describe('VercelError', () => {
  describe('construction', () => {
    it('creates with just a message', () => {
      const error = new VercelError('something failed');
      expect(error.message).toBe('something failed');
      expect(error.name).toBe('VercelError');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof VercelError).toBe(true);
    });

    it('creates with all options', () => {
      const cause = new Error('root cause');
      const error = new VercelError('operation failed', {
        attributes: { 'http.method': 'POST' },
        cause,
        code: 'OP_FAILED',
        fix: 'Refresh the token',
        link: 'https://docs.example.com/errors/op-failed',
        metadata: { userId: '456' },
        public: {
          fix: 'Sign in again',
          message: 'Your session expired',
          reason: 'The session is no longer valid',
        },
        reason: 'Token expired',
        requestId: 'req-123',
        scope: 'auth',
        statusCode: 500,
      });

      expect(error.code).toBe('OP_FAILED');
      expect(error.scope).toBe('auth');
      expect(error.statusCode).toBe(500);
      expect(error.reason).toBe('Token expired');
      expect(error.fix).toBe('Refresh the token');
      expect(error.link).toBe('https://docs.example.com/errors/op-failed');
      expect(error.public).toEqual({
        fix: 'Sign in again',
        message: 'Your session expired',
        reason: 'The session is no longer valid',
      });
      expect(error.requestId).toBe('req-123');
      expect(error.cause).toBe(cause);
      expect(error.metadata).toEqual({ userId: '456' });
      expect(error.attributes).toEqual({ 'http.method': 'POST' });
    });

    it.each([
      {},
      { message: '' },
      { message: '   ' },
      { message: 123 },
      { message: 'Safe', hint: 123 },
      'not an object',
    ])(
      'throws TypeError at construction for invalid public details: %o',
      (publicDetails) => {
        expect(
          () => new VercelError('test', { public: publicDetails as never }),
        ).toThrow(TypeError);
      },
    );

    it('drops unknown public fields at construction', () => {
      const error = new VercelError('test', {
        public: {
          message: 'Public message',
          scope: 'must not ride along',
          stack: 'must not ride along',
        } as never,
      });

      expect(error.public).toEqual({ message: 'Public message' });
      expect(Object.isFrozen(error.public)).toBe(true);
    });

    it('ignores reserved properties from options', () => {
      const error = new VercelError('test', {
        // @ts-expect-error
        message: 'fake message',
        // @ts-expect-error
        name: 'FakeName',
        // @ts-expect-error -- testing runtime safety
        stack: 'fake stack',
      });
      expect(error.message).toBe('test');
      expect(error.name).toBe('VercelError');
      expect(error.stack).not.toBe('fake stack');
    });

    it('subclass preserves prototype chain', () => {
      class AppError extends VercelError {}
      const error = new AppError('test');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof VercelError).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    it('subclass inherits VercelError name unless overridden', () => {
      class DatabaseError extends VercelError {}
      const error = new DatabaseError('pool exhausted');
      expect(error.name).toBe('VercelError');
    });

    it('subclass can hardcode its own name for minification safety', () => {
      class DatabaseError extends VercelError {
        constructor(message: string, options?: VercelErrorOptions) {
          super(message, options);
          this.name = 'DatabaseError';
        }
      }
      const error = new DatabaseError('pool exhausted');
      expect(error.name).toBe('DatabaseError');
    });
  });

  describe('VERCEL_ERROR_TAG', () => {
    it('is set as non-enumerable', () => {
      const error = new VercelError('test');
      expect(
        (error as unknown as Record<symbol, unknown>)[VERCEL_ERROR_TAG],
      ).toBe(true);
      expect(
        Object.prototype.propertyIsEnumerable.call(error, VERCEL_ERROR_TAG),
      ).toBe(false);
      expect(Object.getOwnPropertySymbols({ ...error })).toEqual([]);
    });

    it('is not writable or configurable', () => {
      const error = new VercelError('test');
      const descriptor = Object.getOwnPropertyDescriptor(
        error,
        VERCEL_ERROR_TAG,
      );
      expect(descriptor?.writable).toBe(false);
      expect(descriptor?.configurable).toBe(false);
      expect(descriptor?.enumerable).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('includes non-enumerable Error properties', () => {
      const error = new VercelError('test message');
      const json = error.toJSON();
      expect(json['name']).toBe('VercelError');
      expect(json['message']).toBe('test message');
      expect(json['stack']).toBeDefined();
    });

    it('includes all enumerable properties', () => {
      const error = new VercelError('test', {
        code: 'TEST_CODE',
        metadata: { key: 'value' },
        public: { message: 'Public test message' },
        reason: 'test reason',
        scope: 'test-scope',
      });
      const json = error.toJSON();
      expect(json['code']).toBe('TEST_CODE');
      expect(json['scope']).toBe('test-scope');
      expect(json['reason']).toBe('test reason');
      expect(json['metadata']).toEqual({ key: 'value' });
      expect(json['public']).toEqual({ message: 'Public test message' });
    });

    it('excludes undefined values', () => {
      const error = new VercelError('test');
      const json = error.toJSON();
      expect(json).not.toHaveProperty('reason');
      expect(json).not.toHaveProperty('fix');
      expect(json).not.toHaveProperty('hint');
      expect(json).not.toHaveProperty('link');
      expect(json).not.toHaveProperty('public');
      expect(json).not.toHaveProperty('requestId');
      expect(json).not.toHaveProperty('metadata');
      expect(json).not.toHaveProperty('attributes');
    });

    it('excludes cause', () => {
      const error = new VercelError('test', {
        cause: new Error('root'),
      });
      const json = error.toJSON();
      expect(json['cause']).toBeUndefined();
    });

    it('works with JSON.stringify', () => {
      const error = new VercelError('test', { code: 'X' });
      const parsed = JSON.parse(JSON.stringify(error)) as Record<
        string,
        unknown
      >;
      expect(parsed['message']).toBe('test');
      expect(parsed['code']).toBe('X');
      expect(parsed['name']).toBe('VercelError');
    });

    it('includes subclass properties', () => {
      class RetryableError extends VercelError {
        readonly retryable: boolean;
        constructor(message: string, retryable: boolean) {
          super(message);
          this.retryable = retryable;
        }
      }
      const error = new RetryableError('service unavailable', true);
      const json = error.toJSON();
      expect(json['retryable']).toBe(true);
    });
  });

  describe('toString', () => {
    it('renders error prefix, name, and message', () => {
      const error = new VercelError('something failed');
      const str = error.toString();
      expect(str).toContain('error:');
      expect(str).toContain('VercelError');
      expect(str).toContain('something failed');
    });

    it('includes scope and code when both present', () => {
      const error = new VercelError('failed', {
        code: 'rate_limited',
        scope: 'auth',
      });
      expect(error.toString()).toContain('VercelError [auth:rate_limited]');
    });

    it('includes only scope when code is absent', () => {
      const error = new VercelError('failed', { scope: 'auth' });
      expect(error.toString()).toContain('VercelError [auth]');
    });

    it('includes only code when scope is absent', () => {
      const error = new VercelError('failed', { code: 'rate_limited' });
      expect(error.toString()).toContain('VercelError [rate_limited]');
    });

    it('renders context fields', () => {
      const error = new VercelError('failed', {
        fix: 'Use exponential backoff',
        hint: 'Try using exponential backoff',
        link: 'https://docs.example.com/rate-limits',
        reason: 'Too many requests',
      });
      const str = error.toString();
      expect(str).toContain('Too many requests');
      expect(str).toContain('hint: Try using');
      expect(str).toContain('fix: Use exponential backoff');
      expect(str).toContain('read more: https://docs.example.com/rate-limits');
    });

    it('omits context fields when not set', () => {
      const error = new VercelError('simple error');
      const str = error.toString();
      expect(str).toContain('VercelError');
      expect(str).toContain('simple error');
    });
  });
});
