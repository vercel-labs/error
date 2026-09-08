import { describe, expect, it } from 'vitest';

import {
  fromErrorResponse,
  parseErrorResponse,
  projectErrorResponse,
  type ErrorResponse,
} from '.';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

describe('error codec', () => {
  describe('projectErrorResponse', () => {
    it('projects only explicit public prose and wire identity', () => {
      const error = new VercelError('Database shard 7 failed', {
        attributes: { shard: 7 },
        cause: new Error('socket closed'),
        code: 'unavailable',
        fix: 'Restart shard 7',
        metadata: { host: '10.0.0.7' },
        public: {
          fix: 'Try again shortly',
          hint: 'Your request is safe to retry',
          link: 'https://status.example.com',
          message: 'Service unavailable',
          reason: 'A dependency is temporarily unavailable',
        },
        reason: 'Shard process exited',
        requestId: 'req_123',
        scope: 'database',
        statusCode: 503,
      });

      expect(projectErrorResponse(error)).toEqual({
        error: {
          code: 'unavailable',
          fix: 'Try again shortly',
          hint: 'Your request is safe to retry',
          link: 'https://status.example.com',
          message: 'Service unavailable',
          reason: 'A dependency is temporarily unavailable',
          scope: 'database',
        },
      });
    });

    it('uses a fixed generic message when public details are absent', () => {
      const error = new VercelError('Secret developer detail', {
        code: 'internal',
        fix: 'Developer-only fix',
        reason: 'Developer-only reason',
        scope: 'api',
      });

      expect(projectErrorResponse(error)).toEqual({
        error: {
          code: 'internal',
          message: 'An error occurred.',
          scope: 'api',
        },
      });
    });

    it.each([
      {},
      { message: '' },
      { message: '   ' },
      { message: 123 },
      { message: 'Safe', reason: 123 },
    ])('rejects malformed public details: %o', (publicDetails) => {
      const error = new VercelError('Developer detail', {
        public: publicDetails as never,
      });
      expect(() => projectErrorResponse(error)).toThrow(TypeError);
    });

    it('projects flat input as explicitly public data', () => {
      expect(
        projectErrorResponse({
          code: 'invalid',
          fix: 'Correct the value',
          hint: 'Use an integer',
          link: 'https://docs.example.com/invalid',
          message: 'The value is invalid',
          reason: 'The value is not an integer',
          scope: 'input',
          statusCode: 400,
        }),
      ).toEqual({
        error: {
          code: 'invalid',
          fix: 'Correct the value',
          hint: 'Use an integer',
          link: 'https://docs.example.com/invalid',
          message: 'The value is invalid',
          reason: 'The value is not an integer',
          scope: 'input',
        },
      });
    });

    it.each(['', '   '])('rejects a blank flat message: %o', (message) => {
      expect(() => projectErrorResponse({ message })).toThrow(TypeError);
    });

    it('omits explicitly undefined optional producer fields', () => {
      const publicError = new VercelError('Developer detail', {
        public: {
          fix: undefined,
          hint: undefined,
          link: undefined,
          message: 'Public message',
          reason: undefined,
        },
      });
      const flatError = {
        code: undefined,
        fix: undefined,
        hint: undefined,
        link: undefined,
        message: 'Public message',
        reason: undefined,
        scope: undefined,
        statusCode: undefined,
      };

      expect(projectErrorResponse(publicError)).toEqual({
        error: { message: 'Public message' },
      });
      expect(projectErrorResponse(flatError)).toEqual({
        error: { message: 'Public message' },
      });
    });

    it('accepts a forged but valid tagged data contract', () => {
      const error = {
        code: 'timeout',
        message: 'Developer timeout detail',
        public: { message: 'Please try again' },
        scope: 'api',
        [VERCEL_ERROR_TAG]: true,
      };

      expect(projectErrorResponse(error)).toEqual({
        error: {
          code: 'timeout',
          message: 'Please try again',
          scope: 'api',
        },
      });
    });

    it('ignores unknown public fields during projection', () => {
      const error = new VercelError('Developer detail', {
        public: {
          message: 'Public message',
          unknown: 'must not cross the wire',
        } as never,
      });

      expect(projectErrorResponse(error)).toEqual({
        error: { message: 'Public message' },
      });
    });

    it('rejects tagged-invalid data before the flat public-input branch', () => {
      const invalid = {
        code: 'timeout',
        message: 'This must not become public',
        public: {},
        [VERCEL_ERROR_TAG]: true,
      };

      expect(() => projectErrorResponse(invalid as never)).toThrowError(
        new TypeError('Invalid VercelError-like value'),
      );
    });

    it.each([
      {
        code: 'internal',
        fix: 'Inspect 10.0.0.7',
        message: 'Database shard 7 failed',
        public: undefined,
        reason: 'Shard process exited',
        [Symbol.for('__vercel_error')]: true,
      },
      {
        message: 'Sparse developer detail',
        reason: undefined,
        [Symbol.for('__vercel_error')]: true,
      },
    ])(
      'rejects a shipped 0.0 tagged value instead of exposing it: %o',
      (old) => {
        expect(() => projectErrorResponse(old as never)).toThrowError(
          new TypeError(
            'VercelError values from 0.0.x cannot be serialized; recreate the error with explicit public details',
          ),
        );
      },
    );
  });

  describe('parseErrorResponse', () => {
    it('parses known fields and ignores unknown fields', () => {
      expect(
        parseErrorResponse({
          error: {
            code: 'rate_limited',
            fix: 'Wait and retry',
            hint: 'Reduce request volume',
            link: 'https://docs.example.com/rate-limits',
            message: 'Too many requests',
            metadata: { secret: true },
            reason: 'The request limit was exceeded',
            requestId: 'req_123',
            scope: 'api',
          },
        }),
      ).toEqual({
        error: {
          code: 'rate_limited',
          fix: 'Wait and retry',
          hint: 'Reduce request volume',
          link: 'https://docs.example.com/rate-limits',
          message: 'Too many requests',
          reason: 'The request limit was exceeded',
          scope: 'api',
        },
      });
    });

    it.each([
      undefined,
      null,
      {},
      { error: null },
      { error: [] },
      { error: {} },
      { error: { message: '' } },
      { error: { message: '   ' } },
      { error: { message: 123 } },
      { error: { message: 'Error', scope: 123 } },
      { error: { code: 123, message: 'Error' } },
      { error: { hint: false, message: 'Error' } },
    ])('rejects a malformed response: %o', (input) => {
      expect(parseErrorResponse(input)).toBeUndefined();
    });
  });

  describe('fromErrorResponse', () => {
    it('reconstructs developer and public fields while preserving caller context', () => {
      const cause = new Error('upstream failed');
      const response: ErrorResponse = {
        error: {
          code: 'unavailable',
          fix: 'Try again',
          message: 'Service unavailable',
          reason: 'A dependency is unavailable',
          scope: 'payments',
        },
      };

      const error = fromErrorResponse(response, {
        attributes: { 'http.status_code': 503 },
        cause,
        metadata: { upstream: 'payments' },
        requestId: 'req_123',
        statusCode: 503,
      });

      expect(error).toBeInstanceOf(VercelError);
      expect(error.message).toBe('Service unavailable');
      expect(error.scope).toBe('payments');
      expect(error.code).toBe('unavailable');
      expect(error.reason).toBe('A dependency is unavailable');
      expect(error.fix).toBe('Try again');
      expect(error.public).toEqual({
        fix: 'Try again',
        message: 'Service unavailable',
        reason: 'A dependency is unavailable',
      });
      expect(error.statusCode).toBe(503);
      expect(error.cause).toBe(cause);
      expect(error.requestId).toBe('req_123');
      expect(error.metadata).toEqual({ upstream: 'payments' });
      expect(error.attributes).toEqual({ 'http.status_code': 503 });
    });
  });
});
