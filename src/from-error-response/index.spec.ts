import { describe, it, expect } from 'vitest';

import { fromErrorResponse } from '.';
import type { ErrorResponse } from '../types';
import { VercelError } from '../vercel-error';

describe('fromErrorResponse', () => {
  const minimalResponse: ErrorResponse = {
    error: {
      code: 'rate_limited',
      message: 'Too many requests',
    },
  };

  const fullResponse: ErrorResponse = {
    error: {
      code: 'rate_limited',
      message: 'Too many requests',
      reason: 'Per-IP limit exceeded',
      hint: 'Your IP has exceeded the hourly limit',
      fix: 'Wait and retry with exponential backoff',
      link: 'https://docs.example.com/rate-limits',
    },
  };

  it('creates a VercelError from a minimal ErrorResponse', () => {
    const error = fromErrorResponse(minimalResponse);
    expect(error).toBeInstanceOf(VercelError);
    expect(error.message).toBe('Too many requests');
    expect(error.code).toBe('rate_limited');
    expect(error.userMessage).toBe('Too many requests');
  });

  it('maps all ErrorResponse fields to VercelError', () => {
    const error = fromErrorResponse(fullResponse);
    expect(error.code).toBe('rate_limited');
    expect(error.message).toBe('Too many requests');
    expect(error.reason).toBe('Per-IP limit exceeded');
    expect(error.hint).toBe('Your IP has exceeded the hourly limit');
    expect(error.fix).toBe('Wait and retry with exponential backoff');
    expect(error.link).toBe('https://docs.example.com/rate-limits');
  });

  it('sets userMessage to the wire message', () => {
    const error = fromErrorResponse(minimalResponse);
    expect(error.userMessage).toBe('Too many requests');
  });

  it('accepts additional options', () => {
    const cause = new Error('upstream failed');
    const error = fromErrorResponse(fullResponse, {
      statusCode: 429,
      scope: 'upstream',
      cause,
      requestId: 'req-abc',
      metadata: { upstream: 'api.vercel.com' },
      attributes: { 'http.status': 429 },
    });
    expect(error.statusCode).toBe(429);
    expect(error.scope).toBe('upstream');
    expect(error.cause).toBe(cause);
    expect(error.requestId).toBe('req-abc');
    expect(error.metadata).toEqual({ upstream: 'api.vercel.com' });
    expect(error.attributes).toEqual({ 'http.status': 429 });
  });

  it('works with no additional options', () => {
    const error = fromErrorResponse(minimalResponse);
    expect(error.statusCode).toBeUndefined();
    expect(error.scope).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('roundtrips through errorResponse', async () => {
    const { errorResponse } = await import('../to-error-response');
    const { parseErrorResponse } = await import('../parse-error-response');

    const original = new VercelError('Internal: pool exhausted', {
      code: 'pool_exhausted',
      userMessage: 'Service unavailable',
      reason: 'All connections in use',
      fix: 'Add pgBouncer',
      link: 'https://docs.example.com',
      statusCode: 503,
    });

    const { body } = errorResponse(original);
    const parsed = parseErrorResponse(JSON.parse(body));
    expect(parsed).toBeDefined();

    const reconstructed = fromErrorResponse(parsed!, { statusCode: 503 });
    expect(reconstructed.code).toBe('pool_exhausted');
    expect(reconstructed.message).toBe('Service unavailable');
    expect(reconstructed.userMessage).toBe('Service unavailable');
    expect(reconstructed.reason).toBe('All connections in use');
    expect(reconstructed.fix).toBe('Add pgBouncer');
    expect(reconstructed.link).toBe('https://docs.example.com');
    expect(reconstructed.statusCode).toBe(503);
  });
});
