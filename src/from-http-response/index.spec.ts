import { describe, expect, it } from 'vitest';

import { fromHttpResponse } from '.';
import { errorResponse } from '../to-error-response';
import { VercelError } from '../vercel-error';

const responseData = {
  error: {
    code: 'unavailable',
    message: 'Service unavailable',
    scope: 'payments',
  },
};

describe('fromHttpResponse', () => {
  it('reconstructs an error with status and the default Vercel request ID', async () => {
    const result = errorResponse(
      new VercelError('Internal payment dependency failed', {
        code: 'unavailable',
        public: { message: 'Service unavailable' },
        scope: 'payments',
        statusCode: 503,
      }),
    );
    const response = new Response(result.body, {
      headers: {
        ...result.headers,
        'x-vercel-id': 'iad1::sfo1::req_123',
      },
      status: result.status,
    });

    const error = await fromHttpResponse(response);

    expect(error).toBeInstanceOf(VercelError);
    expect(error).toMatchObject({
      code: 'unavailable',
      message: 'Service unavailable',
      public: { message: 'Service unavailable' },
      requestId: 'iad1::sfo1::req_123',
      scope: 'payments',
      statusCode: 503,
    });
    expect(response.bodyUsed).toBe(true);
  });

  it('prefers an explicit request ID over the response header', async () => {
    const cause = new Error('fetch failed');
    const response = Response.json(responseData, {
      headers: { 'x-vercel-id': 'vercel_request' },
      status: 500,
    });

    const error = await fromHttpResponse(response, {
      attributes: { 'server.address': 'api.example.com' },
      cause,
      metadata: { attempt: 2 },
      requestId: 'application_request',
    });

    expect(error?.requestId).toBe('application_request');
    expect(error?.cause).toBe(cause);
    expect(error?.attributes).toEqual({
      'server.address': 'api.example.com',
    });
    expect(error?.metadata).toEqual({ attempt: 2 });
  });

  it.each([400, 599])('accepts boundary status %i', async (status) => {
    const response = Response.json(responseData, { status });

    const error = await fromHttpResponse(response);

    expect(error?.statusCode).toBe(status);
  });

  it('reads a configured request ID header', async () => {
    const response = Response.json(responseData, {
      headers: {
        'x-request-id': 'application_request',
        'x-vercel-id': 'vercel_request',
      },
      status: 500,
    });

    const error = await fromHttpResponse(response, {
      requestIdHeader: 'x-request-id',
    });

    expect(error?.requestId).toBe('application_request');
  });

  it('can disable request ID header lookup', async () => {
    const response = Response.json(responseData, {
      headers: { 'x-vercel-id': 'vercel_request' },
      status: 500,
    });

    const error = await fromHttpResponse(response, {
      requestIdHeader: false,
    });

    expect(error?.requestId).toBeUndefined();
  });

  it('propagates an invalid custom header name', async () => {
    const response = Response.json(responseData, { status: 500 });

    await expect(
      fromHttpResponse(response, { requestIdHeader: 'bad header' }),
    ).rejects.toThrow(TypeError);
  });

  it.each([200, 302])(
    'ignores status %i without consuming the body',
    async (status) => {
      const response = Response.json(responseData, { status });

      await expect(fromHttpResponse(response)).resolves.toBeUndefined();
      expect(response.bodyUsed).toBe(false);
    },
  );

  it('ignores a non-JSON response without consuming the body', async () => {
    const response = new Response('Service unavailable', {
      headers: { 'content-type': 'text/plain' },
      status: 503,
    });

    await expect(fromHttpResponse(response)).resolves.toBeUndefined();
    expect(response.bodyUsed).toBe(false);
  });

  it.each(['not JSON', JSON.stringify({ error: { message: '' } })])(
    'returns undefined after consuming invalid response data: %s',
    async (body) => {
      const response = new Response(body, {
        headers: { 'content-type': 'application/json; charset=utf-8' },
        status: 500,
      });

      await expect(fromHttpResponse(response)).resolves.toBeUndefined();
      expect(response.bodyUsed).toBe(true);
    },
  );

  it('returns undefined when the response body was already consumed', async () => {
    const response = Response.json(responseData, { status: 500 });
    await response.text();

    await expect(fromHttpResponse(response)).resolves.toBeUndefined();
  });
});
