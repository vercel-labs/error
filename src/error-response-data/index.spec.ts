import { describe, expect, it } from 'vitest';

import {
  fromErrorResponse,
  parseErrorResponse,
  buildErrorResponseData,
  type ErrorResponseData,
} from '.';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

describe('error response data', () => {
  describe('buildErrorResponseData', () => {
    it('builds response data from explicit public prose and identity', () => {
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

      expect(buildErrorResponseData(error)).toEqual({
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

      expect(buildErrorResponseData(error)).toEqual({
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
    ])(
      'rejects malformed public details at VercelError construction: %o',
      (publicDetails) => {
        expect(
          () =>
            new VercelError('Developer detail', {
              public: publicDetails as never,
            }),
        ).toThrow(TypeError);
      },
    );

    it.each([
      {},
      { message: '' },
      { message: '   ' },
      { message: 123 },
      { message: 'Safe', reason: 123 },
    ])(
      'rejects malformed public details on tagged data at serialization: %o',
      (publicDetails) => {
        const tagged = {
          message: 'Developer detail',
          public: publicDetails,
          [VERCEL_ERROR_TAG]: true,
        };
        expect(() => buildErrorResponseData(tagged as never)).toThrow(
          TypeError,
        );
      },
    );

    it('builds explicitly public response data from flat input', () => {
      expect(
        buildErrorResponseData({
          code: 'invalid',
          fix: 'Correct the value',
          hint: 'Use an integer',
          link: 'https://docs.example.com/invalid',
          message: 'The value is invalid',
          reason: 'The value is not an integer',
          scope: 'input',
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
      expect(() => buildErrorResponseData({ message })).toThrow(TypeError);
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
      };

      expect(buildErrorResponseData(publicError)).toEqual({
        error: { message: 'Public message' },
      });
      expect(buildErrorResponseData(flatError)).toEqual({
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

      expect(buildErrorResponseData(error)).toEqual({
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
          unknown: 'must not reach response data',
        } as never,
      });

      expect(buildErrorResponseData(error)).toEqual({
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

      expect(() => buildErrorResponseData(invalid as never)).toThrowError(
        new TypeError(
          'Tagged VercelError-like data does not match the expected field types',
        ),
      );
    });

    it.each([1, 2, 3, 4, 5])(
      'never serializes a non-string scope smuggled by a getter flipping after %i reads',
      (flipAfter) => {
        let reads = 0;
        const source = {
          message: 'Developer detail',
          public: { message: 'Public message' },
          [VERCEL_ERROR_TAG]: true,
          get scope() {
            reads += 1;
            return reads <= flipAfter ? 'api' : ({ smuggled: true } as never);
          },
        };

        let data: ReturnType<typeof buildErrorResponseData>;
        try {
          data = buildErrorResponseData(source as never);
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
          return;
        }

        expect(
          data.error.scope === undefined ||
            typeof data.error.scope === 'string',
        ).toBe(true);
        expect(data.error.message).toBe('Public message');
      },
    );

    it.each([1, 2, 3, 4, 5])(
      'never serializes a non-string public detail smuggled by a getter flipping after %i reads',
      (flipAfter) => {
        let reads = 0;
        const source = {
          message: 'Developer detail',
          public: {
            message: 'Public message',
            get hint() {
              reads += 1;
              return reads <= flipAfter
                ? 'valid hint'
                : ({ smuggled: true } as never);
            },
          },
          [VERCEL_ERROR_TAG]: true,
        };

        let data: ReturnType<typeof buildErrorResponseData>;
        try {
          data = buildErrorResponseData(source as never);
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
          return;
        }

        expect(
          data.error.hint === undefined || typeof data.error.hint === 'string',
        ).toBe(true);
        expect(data.error.message).toBe('Public message');
      },
    );

    it('never invokes methods on field values of a tagged or flat source', () => {
      const hostile = {
        toString: () => {
          throw new Error('toString must not be invoked');
        },
        toJSON: () => {
          throw new Error('toJSON must not be invoked');
        },
      };

      const tagged = {
        message: 'Developer detail',
        public: { message: 'Public message', link: hostile },
        [VERCEL_ERROR_TAG]: true,
      };
      expect(() => buildErrorResponseData(tagged as never)).toThrowError(
        new TypeError(
          'Tagged VercelError-like data does not match the expected field types',
        ),
      );

      const flat = { message: 'Public message', hint: hostile };
      expect(() => buildErrorResponseData(flat as never)).toThrowError(
        new TypeError('hint must be a string'),
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
        expect(() => buildErrorResponseData(old as never)).toThrowError(
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
      const data: ErrorResponseData = {
        error: {
          code: 'unavailable',
          fix: 'Try again',
          message: 'Service unavailable',
          reason: 'A dependency is unavailable',
          scope: 'payments',
        },
      };

      const error = fromErrorResponse(data, {
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
