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
