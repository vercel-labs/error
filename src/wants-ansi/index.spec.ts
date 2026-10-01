import { describe, expect, it } from 'vitest';

import { wantsAnsi } from '.';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com', { headers });
}

describe('wantsAnsi', () => {
  it('returns false when no request', () => {
    expect(wantsAnsi()).toBe(false);
    expect(wantsAnsi(null)).toBe(false);
  });

  it('returns true for X-Error-Format: ansi', () => {
    expect(wantsAnsi(makeRequest({ 'X-Error-Format': 'ansi' }))).toBe(true);
  });

  it('returns false for X-Error-Format: json', () => {
    expect(wantsAnsi(makeRequest({ 'X-Error-Format': 'json' }))).toBe(false);
  });

  it('returns true for Accept: text/plain+ansi', () => {
    expect(wantsAnsi(makeRequest({ Accept: 'text/plain+ansi' }))).toBe(true);
  });

  it('returns true for Accept containing text/plain+ansi among others', () => {
    expect(
      wantsAnsi(makeRequest({ Accept: 'application/json, text/plain+ansi' })),
    ).toBe(true);
  });

  it.each([
    ['text/plain+ansi', true],
    ['text/plain+ansi;q=0.125', true],
    ['text/plain+ansi;Q=1.000', true],
    ['TEXT/PLAIN+ANSI;Q=0.5', true],
    ['application/json, text/plain+ansi;q=0.5', true],
    ['text/plain+ansi;charset=utf-8', true],
    ['text/plain+ansi;charset="UTF-8";q=0.5', true],
    ['text/plain+ansi;q=0.5;extension=value', true],
    ['text/plain+ansi;charset=iso-8859-1', false],
    ['text/plain+ansi;unsupported=value', false],
    ['text/plain+ansi;q=0', false],
    ['text/plain+ansi;q=2', false],
    ['text/plain+ansi;q=1.001', false],
    ['text/plain+ansi;q=.5', false],
    ['text/plain+ansi;q=0.1234', false],
    ['text/plain+ansi;q=NaN', false],
    ['text/*', false],
    ['*/*', false],
  ] as const)('Accept: %s selects ANSI: %s', (accept, expected) => {
    expect(wantsAnsi(makeRequest({ Accept: accept }))).toBe(expected);
  });

  it('does not fall back to curl when an ANSI range requests another charset', () => {
    expect(
      wantsAnsi(
        makeRequest({
          Accept: 'text/plain+ansi;charset=iso-8859-1',
          'User-Agent': 'curl/8.1.2',
        }),
      ),
    ).toBe(false);
  });

  it('uses the highest valid q from duplicate ANSI ranges', () => {
    expect(
      wantsAnsi(
        makeRequest({
          Accept: 'text/plain+ansi;q=0, text/plain+ansi;q=0.7',
        }),
      ),
    ).toBe(true);
    expect(
      wantsAnsi(
        makeRequest({
          Accept: 'text/plain+ansi;q=0, text/plain+ansi;q=2',
          'User-Agent': 'curl/8.1.2',
        }),
      ),
    ).toBe(false);
  });

  it('skips curl fallback for zero or invalid ANSI q', () => {
    for (const Accept of ['text/plain+ansi;q=0', 'text/plain+ansi;q=invalid']) {
      expect(
        wantsAnsi(makeRequest({ Accept, 'User-Agent': 'curl/8.1.2' })),
      ).toBe(false);
    }
  });

  it('uses JSON when X-Error-Format is present but not ansi', () => {
    expect(
      wantsAnsi(
        makeRequest({
          Accept: 'text/plain+ansi',
          'User-Agent': 'curl/8.1.2',
          'X-Error-Format': 'ANSI',
        }),
      ),
    ).toBe(false);
  });

  it('reads each selecting header no more than once', () => {
    const reads = new Map<string, number>();
    const headers = {
      get(name: string) {
        const normalized = name.toLowerCase();
        reads.set(normalized, (reads.get(normalized) ?? 0) + 1);
        return normalized === 'accept' ? 'text/plain+ansi;q=0' : null;
      },
    };

    expect(wantsAnsi(headers)).toBe(false);
    expect(reads).toEqual(
      new Map([
        ['x-error-format', 1],
        ['accept', 1],
      ]),
    );
  });

  it('returns true for curl user agent', () => {
    expect(wantsAnsi(makeRequest({ 'User-Agent': 'curl/8.1.2' }))).toBe(true);
  });

  it('returns false for browser user agent', () => {
    expect(
      wantsAnsi(
        makeRequest({
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        }),
      ),
    ).toBe(false);
  });

  it('returns false for plain request with no special headers', () => {
    expect(wantsAnsi(makeRequest())).toBe(false);
  });

  it('uses an explicit ANSI format before the User-Agent heuristic', () => {
    expect(
      wantsAnsi(
        makeRequest({
          'User-Agent': 'Mozilla/5.0',
          'X-Error-Format': 'ansi',
        }),
      ),
    ).toBe(true);
  });

  it.each(['json', 'plain', 'unsupported'])(
    'uses explicit format %s before ANSI fallbacks',
    (format) => {
      expect(
        wantsAnsi(
          makeRequest({
            Accept: 'text/plain+ansi',
            'User-Agent': 'curl/8.1.2',
            'X-Error-Format': format,
          }),
        ),
      ).toBe(false);
    },
  );

  describe('with Headers object', () => {
    it('returns true for X-Error-Format: ansi', () => {
      const headers = new Headers({ 'X-Error-Format': 'ansi' });
      expect(wantsAnsi(headers)).toBe(true);
    });

    it('returns true for curl user agent', () => {
      const headers = new Headers({ 'User-Agent': 'curl/8.1.2' });
      expect(wantsAnsi(headers)).toBe(true);
    });

    it('returns false for plain headers', () => {
      const headers = new Headers();
      expect(wantsAnsi(headers)).toBe(false);
    });

    it('returns true for Accept: text/plain+ansi', () => {
      const headers = new Headers({ Accept: 'text/plain+ansi' });
      expect(wantsAnsi(headers)).toBe(true);
    });
  });

  describe('with HeadersLike (duck-typed)', () => {
    it('returns true for X-Error-Format: ansi', () => {
      const headers = {
        get: (name: string) =>
          name.toLowerCase() === 'x-error-format' ? 'ansi' : null,
      };
      expect(wantsAnsi(headers)).toBe(true);
    });

    it('returns true for curl user agent', () => {
      const headers = {
        get: (name: string) =>
          name.toLowerCase() === 'user-agent' ? 'curl/8.1.2' : null,
      };
      expect(wantsAnsi(headers)).toBe(true);
    });

    it('returns false when no ansi signals', () => {
      const headers = { get: () => null };
      expect(wantsAnsi(headers)).toBe(false);
    });

    it('works with request-like objects that have a headers property', () => {
      const requestLike = {
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'x-error-format' ? 'ansi' : null,
        },
      };
      expect(wantsAnsi(requestLike as unknown as Request)).toBe(true);
    });
  });
});
