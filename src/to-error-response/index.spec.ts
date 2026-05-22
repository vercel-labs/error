import { describe, expect, it } from 'vitest';

import { errorResponse } from '.';
import type { ErrorResponse } from '../types';
import { VercelError } from '../vercel-error';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers });
}

function parseBody(body: string): ErrorResponse {
  return JSON.parse(body) as ErrorResponse;
}

describe('errorResponse', () => {
  describe('with VercelError', () => {
    it('returns status, body string, and headers', () => {
      const error = new VercelError('internal detail', {
        code: 'pool_exhausted',
        statusCode: 503,
        userMessage: 'Service temporarily unavailable',
      });
      const { status, body, headers } = errorResponse(error);
      expect(status).toBe(503);
      expect(headers['Content-Type']).toBe('application/json');

      const parsed = parseBody(body);
      expect(parsed.error.code).toBe('pool_exhausted');
      expect(parsed.error.message).toBe('Service temporarily unavailable');
    });

    it('falls back to message when no userMessage', () => {
      const error = new VercelError('Pool exhausted', { code: 'err' });
      const parsed = parseBody(errorResponse(error).body);
      expect(parsed.error.message).toBe('Pool exhausted');
    });

    it('prefers userMessage over message', () => {
      const error = new VercelError(
        'PostgreSQL shard-3 pool exhausted at 10.0.1.5',
        {
          code: 'pool_exhausted',
          userMessage: 'Service temporarily unavailable',
        },
      );
      const parsed = parseBody(errorResponse(error).body);
      expect(parsed.error.message).toBe('Service temporarily unavailable');
    });

    it('defaults status to 500', () => {
      const error = new VercelError('fail', { code: 'err' });
      expect(errorResponse(error).status).toBe(500);
    });

    it('includes reason, hint, fix, link when present', () => {
      const error = new VercelError('fail', {
        code: 'rate_limited',
        fix: 'Wait and retry',
        hint: 'Consider using a rate limiter',
        link: 'https://docs.example.com',
        reason: 'Per-IP limit exceeded',
        userMessage: 'Too many requests',
      });
      const parsed = parseBody(errorResponse(error).body);
      expect(parsed.error.reason).toBe('Per-IP limit exceeded');
      expect(parsed.error.hint).toBe('Consider using a rate limiter');
      expect(parsed.error.fix).toBe('Wait and retry');
      expect(parsed.error.link).toBe('https://docs.example.com');
    });

    it('omits optional fields when not set', () => {
      const error = new VercelError('fail', {
        code: 'err',
        userMessage: 'Error',
      });
      const parsed = parseBody(errorResponse(error).body);
      expect(parsed.error).not.toHaveProperty('reason');
      expect(parsed.error).not.toHaveProperty('hint');
      expect(parsed.error).not.toHaveProperty('fix');
      expect(parsed.error).not.toHaveProperty('link');
    });

    it('excludes sensitive fields from body', () => {
      const error = new VercelError('Error', {
        attributes: { 'db.query': 'SELECT' },
        cause: new Error('Cause'),
        code: 'ERR',
        metadata: { userId: '123' },
        requestId: 'req-abc',
        scope: 'backend',
      });
      const parsed = JSON.parse(errorResponse(error).body) as Record<
        string,
        unknown
      >;
      const errObj = parsed['error'] as Record<string, unknown>;
      expect(errObj['stack']).toBeUndefined();
      expect(errObj['cause']).toBeUndefined();
      expect(errObj['metadata']).toBeUndefined();
      expect(errObj['attributes']).toBeUndefined();
      expect(errObj['scope']).toBeUndefined();
      expect(errObj['requestId']).toBeUndefined();
    });

    it('omits code when not set', () => {
      const error = new VercelError('fail', {});
      const parsed = parseBody(errorResponse(error).body);
      expect(parsed.error.code).toBeUndefined();
    });
  });

  describe('with plain params', () => {
    it('builds JSON response from plain params', () => {
      const { status, body, headers } = errorResponse({
        code: 'bad_request',
        message: 'Email is required',
        status: 400,
      });
      expect(status).toBe(400);
      expect(headers['Content-Type']).toBe('application/json');
      const parsed = parseBody(body);
      expect(parsed.error.code).toBe('bad_request');
      expect(parsed.error.message).toBe('Email is required');
    });

    it('defaults status to 500 for plain params', () => {
      expect(
        errorResponse({ code: 'err', message: 'Something went wrong' }).status,
      ).toBe(500);
    });

    it('omits code when not provided in plain params', () => {
      const parsed = parseBody(
        errorResponse({ message: 'Something went wrong' }).body,
      );
      expect(parsed.error.code).toBeUndefined();
      expect(parsed.error.message).toBe('Something went wrong');
    });

    it('includes optional fields from plain params', () => {
      const parsed = parseBody(
        errorResponse({
          code: 'rate_limited',
          fix: 'Wait',
          link: 'https://docs.example.com',
          message: 'Too many requests',
          reason: 'Per-IP limit',
          status: 429,
        }).body,
      );
      expect(parsed.error.reason).toBe('Per-IP limit');
      expect(parsed.error.fix).toBe('Wait');
      expect(parsed.error.link).toBe('https://docs.example.com');
    });
  });

  describe('content negotiation', () => {
    it('returns JSON by default (no request)', () => {
      const error = new VercelError('fail', { code: 'err' });
      const { headers } = errorResponse(error);
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('returns JSON for browser requests', () => {
      const error = new VercelError('fail', { code: 'err' });
      const { headers } = errorResponse(
        error,
        makeRequest({ 'User-Agent': 'Mozilla/5.0' }),
      );
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('returns text/plain for curl', () => {
      const error = new VercelError('Build compilation failed', {
        code: 'compile_error',
        reason: 'Bad things',
        userMessage: 'Something broke',
      });
      const { body, headers } = errorResponse(
        error,
        makeRequest({ 'User-Agent': 'curl/8.1.2' }),
      );
      expect(headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(body).toContain('error:');
      expect(body).toContain('VercelError');
      expect(body).toContain('Build compilation failed');
      expect(body).toContain('Bad things');
    });

    it('returns text/plain for X-Error-Format: ansi', () => {
      const error = new VercelError('fail', {
        code: 'err',
        userMessage: 'Error occurred',
      });
      const { headers } = errorResponse(
        error,
        makeRequest({ 'X-Error-Format': 'ansi' }),
      );
      expect(headers['Content-Type']).toBe('text/plain; charset=utf-8');
    });

    it('uses error.toString() for VercelError ANSI path', () => {
      const error = new VercelError('fail', {
        code: 'test_code',
        fix: 'Do this to fix',
        reason: 'Detailed reason',
        userMessage: 'User-facing message',
      });
      const { body } = errorResponse(
        error,
        makeRequest({ 'X-Error-Format': 'ansi' }),
      );
      expect(body).toContain('VercelError');
      expect(body).toContain('Detailed reason');
    });

    it('uses frame() for plain params ANSI path', () => {
      const { body, headers } = errorResponse(
        {
          code: 'not_found',
          fix: 'Check the ID',
          link: 'https://docs.example.com',
          message: 'Resource not found',
          reason: 'ID does not exist',
        },
        makeRequest({ 'X-Error-Format': 'ansi' }),
      );
      expect(headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(body).toContain('error:');
      expect(body).toContain('Resource not found');
      expect(body).toContain('ID does not exist');
    });

    it('accepts Headers object directly', () => {
      const error = new VercelError('fail', { code: 'err' });
      const headers = new Headers({ 'X-Error-Format': 'ansi' });
      const result = errorResponse(error, headers);
      expect(result.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    });

    it('headers can be spread into Response constructor', () => {
      const error = new VercelError('fail', { code: 'err' });
      const { status, body, headers } = errorResponse(error);
      const response = new Response(body, { headers, status });
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });
});
