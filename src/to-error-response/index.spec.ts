import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import { describe, expect, it, vi } from 'vitest';

import { errorResponse } from '.';
import { parseErrorResponse, fromErrorResponse } from '../error-response-data';
import { VercelError } from '../vercel-error';
import { VERCEL_ERROR_TAG } from '../vercel-error/tag';

/* oxlint-disable no-control-regex -- intentional ANSI/control assertions */
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers });
}

async function cloneThroughMessageChannel(value: unknown): Promise<unknown> {
  const { port1, port2 } = new MessageChannel();
  try {
    return await new Promise((resolve) => {
      port2.once('message', resolve);
      port1.postMessage(value);
    });
  } finally {
    port1.close();
    port2.close();
  }
}

describe('errorResponse', () => {
  it('serializes only explicit public prose and response identity', () => {
    const error = new VercelError('Database shard 7 failed', {
      attributes: { shard: 7 },
      cause: new Error('socket closed'),
      code: 'unavailable',
      fix: 'Restart shard 7',
      metadata: { host: '10.0.0.7' },
      public: {
        fix: 'Try again shortly',
        message: 'Service unavailable',
        reason: 'A dependency is temporarily unavailable',
      },
      reason: 'Shard process exited',
      requestId: 'req_123',
      scope: 'database',
      statusCode: 503,
    });

    const result = errorResponse(error);

    expect(result.status).toBe(503);
    expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(result.body)).toEqual({
      error: {
        code: 'unavailable',
        fix: 'Try again shortly',
        message: 'Service unavailable',
        reason: 'A dependency is temporarily unavailable',
        scope: 'database',
      },
    });
    expect(result.body).not.toContain('Database shard 7 failed');
    expect(result.body).not.toContain('Shard process exited');
    expect(result.body).not.toContain('req_123');
    expect(result.body).not.toContain('10.0.0.7');
    expect(result.body).not.toContain('socket closed');
  });

  it('uses a fixed public fallback without developer prose', () => {
    const result = errorResponse(
      new VercelError('Secret developer detail', {
        code: 'internal',
        reason: 'Secret reason',
        scope: 'api',
      }),
    );

    expect(JSON.parse(result.body)).toEqual({
      error: {
        code: 'internal',
        message: 'An error occurred.',
        scope: 'api',
      },
    });
  });

  it.each([
    new Error('postgres://internal-db.example/private'),
    new Proxy(new Error('internal database hostname: db.private'), {}),
    Object.defineProperty(new Error('token=secret'), Symbol.toStringTag, {
      value: 'Object',
    }),
    structuredClone(
      new VercelError('Internal shard 7 failed', {
        public: { message: 'Service unavailable' },
      }),
    ),
  ])('rejects an untagged Error instead of disclosing it: %o', (error) => {
    expect(() => errorResponse(error)).toThrow(TypeError);
  });

  it('snapshots and freezes public details at construction', () => {
    const publicDetails = { message: 'Safe public message' };
    const error = new VercelError('Internal account 42 failed', {
      public: publicDetails,
    });

    publicDetails.message = error.message;

    expect(Object.isFrozen(error.public)).toBe(true);
    expect(JSON.parse(errorResponse(error).body).error.message).toBe(
      'Safe public message',
    );
  });

  it('uses nested public details and statusCode from explicit input', () => {
    const result = errorResponse({
      code: 'invalid',
      public: { message: 'Invalid request' },
      scope: 'input',
      statusCode: 400,
    });

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: {
        code: 'invalid',
        message: 'Invalid request',
        scope: 'input',
      },
    });
  });

  it('rejects legacy flat public input', () => {
    expect(() =>
      errorResponse({ message: 'Must not become public' } as never),
    ).toThrowError(
      new TypeError(
        'Untagged error response input must provide public details',
      ),
    );
  });

  it('rejects minimal tagged data after MessageChannel removes its tag', async () => {
    const received = await cloneThroughMessageChannel({
      message: 'Secret developer detail',
      [VERCEL_ERROR_TAG]: true,
    });

    expect(Object.getOwnPropertySymbols(received as object)).toEqual([]);
    expect(() => errorResponse(received as never)).toThrow(TypeError);
  });

  it('uses only nested public details after MessageChannel removes the tag', async () => {
    const received = await cloneThroughMessageChannel({
      code: 'unavailable',
      message: 'Secret developer detail',
      public: { message: 'Service unavailable' },
      scope: 'api',
      [VERCEL_ERROR_TAG]: true,
    });

    const result = errorResponse(received as never);
    expect(JSON.parse(result.body)).toEqual({
      error: {
        code: 'unavailable',
        message: 'Service unavailable',
        scope: 'api',
      },
    });
    expect(result.body).not.toContain('Secret developer detail');
  });

  it('defaults an omitted statusCode to 500', () => {
    expect(errorResponse({ public: { message: 'Failed' } }).status).toBe(500);
    expect(errorResponse(new VercelError('Failed')).status).toBe(500);
  });

  it.each([400, 599])('accepts boundary statusCode %s', (statusCode) => {
    expect(
      errorResponse({ public: { message: 'Failed' }, statusCode }).status,
    ).toBe(statusCode);
  });

  it.each([null, '500', Number.NaN, Infinity, -Infinity, 499.5, 399, 600])(
    'rejects invalid statusCode %s',
    (statusCode) => {
      expect(() =>
        errorResponse({ public: { message: 'Failed' }, statusCode } as never),
      ).toThrowError(
        new RangeError('statusCode must be an integer between 400 and 599'),
      );
    },
  );

  it('validates status before projection and onSerialize', () => {
    const onSerialize = vi.fn();
    const malformed = {
      message: 'Must not become public',
      public: {},
      statusCode: 399,
      [VERCEL_ERROR_TAG]: true,
    };

    expect(() =>
      errorResponse(malformed as never, { onSerialize }),
    ).toThrowError(
      new RangeError('statusCode must be an integer between 400 and 599'),
    );
    expect(onSerialize).not.toHaveBeenCalled();
  });

  it('rejects tagged-invalid input before nested public projection', () => {
    const malformed = {
      message: 'Must not become public',
      public: {},
      [VERCEL_ERROR_TAG]: true,
    };

    expect(() => errorResponse(malformed as never)).toThrowError(
      new TypeError(
        'Tagged VercelError-like data does not match the expected field types',
      ),
    );
  });

  it('renders the normalized public payload when ANSI is requested', () => {
    const error = new VercelError('Developer message', {
      code: 'unavailable',
      fix: 'Developer fix',
      public: {
        fix: 'Try again',
        message: 'Service unavailable',
        reason: 'A dependency is unavailable',
      },
      reason: 'Developer reason',
      scope: 'api',
    });

    const request = makeRequest({ 'X-Error-Format': 'ansi' });
    vi.stubGlobal('process', {
      env: { NO_COLOR: '1' },
      stdout: { isTTY: false },
    });
    const result = errorResponse(error, { request });
    vi.unstubAllGlobals();

    expect(result.headers).toEqual({
      'Content-Type': 'text/plain; charset=utf-8',
    });
    expect(result.body).toContain('Service unavailable');
    expect(result.body).toContain('A dependency is unavailable');
    expect(result.body).toContain('Try again');
    expect(result.body).toContain('api:unavailable');
    expect(result.body).toContain('\x1b[');
    expect(result.body).not.toContain('Developer message');
    expect(result.body).not.toContain('Developer reason');
    expect(result.body).not.toContain('Developer fix');
  });

  it('sanitizes and contains every public field in ANSI output', () => {
    const ESC = '\x1b';
    const hostile = (field: string) =>
      `${field}\tcolumn\r\nforged\rbad${ESC}[31mred${ESC}[0m${ESC}]52;c;payload${ESC}\\end\x9b`;
    const result = errorResponse(
      new VercelError('Developer message', {
        code: hostile('code'),
        public: {
          fix: hostile('fix'),
          hint: hostile('hint'),
          link: hostile('link'),
          message: hostile('message'),
          reason: hostile('reason'),
        },
        scope: hostile('scope'),
      }),
      { request: makeRequest({ 'X-Error-Format': 'ansi' }) },
    );

    const text = stripAnsi(result.body);
    expect(text).not.toContain('\r');
    expect(text).not.toContain('\x9b');
    expect(text).not.toContain('payload');
    for (const field of [
      'scope',
      'code',
      'message',
      'reason',
      'hint',
      'fix',
      'link',
    ]) {
      expect(text).toContain(`${field}\tcolumn`);
    }
    expect(
      text
        .split('\n')
        .slice(1)
        .every((line) => /^(?:│|├|╰)/.test(line)),
    ).toBe(true);
  });

  it('uses JSON for a browser request', () => {
    const result = errorResponse(
      { public: { message: 'Failed' } },
      { request: makeRequest({ 'User-Agent': 'Mozilla/5.0' }) },
    );
    expect(result.headers['Content-Type']).toBe('application/json');
  });

  it('accepts Headers directly through options', () => {
    const result = errorResponse(
      { public: { message: 'Failed' } },
      { request: new Headers({ 'X-Error-Format': 'ansi' }) },
    );
    expect(result.headers['Content-Type']).toBe('text/plain; charset=utf-8');
  });

  it('calls onSerialize after constructing the complete JSON result', () => {
    const source = new VercelError('Developer message', {
      attributes: { retryable: true },
      public: { message: 'Public message' },
      statusCode: 503,
    });
    let resultObserved = false;
    const onSerialize = vi.fn((error, context) => {
      expect(error).toBe(source);
      expect(error.attributes).toEqual({ retryable: true });
      expect(context).toEqual({ bodyFormat: 'json', status: 503 });
      resultObserved = true;
    });

    const result = errorResponse(source, { onSerialize });

    expect(resultObserved).toBe(true);
    expect(onSerialize).toHaveBeenCalledOnce();
    expect(JSON.parse(result.body).error.message).toBe('Public message');
  });

  it('reports ANSI body format context', () => {
    const onSerialize = vi.fn();
    errorResponse(
      { public: { message: 'Failed' }, statusCode: 400 },
      {
        onSerialize,
        request: makeRequest({ 'X-Error-Format': 'ansi' }),
      },
    );

    expect(onSerialize).toHaveBeenCalledWith(expect.anything(), {
      bodyFormat: 'ansi',
      status: 400,
    });
  });

  it('propagates a synchronous onSerialize failure', () => {
    const failure = new Error('diagnostics failed');
    expect(() =>
      errorResponse(
        { public: { message: 'Failed' } },
        {
          onSerialize: () => {
            throw failure;
          },
        },
      ),
    ).toThrow(failure);
  });

  it('round trips public data through client reconstruction', () => {
    const first = errorResponse(
      new VercelError('Developer message', {
        code: 'unavailable',
        public: {
          fix: 'Try again',
          message: 'Service unavailable',
          reason: 'A dependency is unavailable',
        },
        scope: 'payments',
        statusCode: 503,
      }),
    );
    const parsed = parseErrorResponse(JSON.parse(first.body));
    assert(parsed);
    const reconstructed = fromErrorResponse(parsed, {
      statusCode: first.status,
    });

    const secondJson = errorResponse(reconstructed);
    expect(secondJson).toEqual(first);

    const secondText = errorResponse(reconstructed, {
      request: makeRequest({ 'X-Error-Format': 'ansi' }),
    });
    expect(secondText.status).toBe(503);
    expect(secondText.body).toContain('payments:unavailable');
    expect(secondText.body).toContain('Service unavailable');
    expect(secondText.body).toContain('A dependency is unavailable');
    expect(secondText.body).toContain('Try again');
  });

  it('can construct a native Response from the result', () => {
    const result = errorResponse({
      public: { message: 'Not found' },
      statusCode: 404,
    });
    const response = new Response(result.body, result);

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
/* oxlint-enable no-control-regex */
