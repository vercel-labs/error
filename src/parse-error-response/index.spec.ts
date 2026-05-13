import { describe, it, expect } from 'vitest';

import { parseErrorResponse } from '.';

describe('parseErrorResponse', () => {
  it('parses valid payload with required fields', () => {
    const result = parseErrorResponse({
      error: { code: 'rate_limited', message: 'Too many requests' },
    });
    expect(result).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests' },
    });
  });

  it('parses valid payload with all optional fields', () => {
    const result = parseErrorResponse({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        reason: 'Per-IP limit exceeded',
        fix: 'Wait and retry',
        link: 'https://docs.example.com',
      },
    });
    expect(result).toEqual({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        reason: 'Per-IP limit exceeded',
        fix: 'Wait and retry',
        link: 'https://docs.example.com',
      },
    });
  });

  it('excludes invalid-type and empty optional fields', () => {
    const result = parseErrorResponse({
      error: {
        code: 'test',
        message: 'Error',
        reason: 'Valid',
        fix: 123,
        link: '   ',
      },
    });
    expect(result).toEqual({
      error: {
        code: 'test',
        message: 'Error',
        reason: 'Valid',
      },
    });
  });

  it('accepts missing code', () => {
    const result = parseErrorResponse({ error: { message: 'Error' } });
    expect(result).toEqual({ error: { message: 'Error' } });
  });

  it('excludes empty code', () => {
    const result = parseErrorResponse({
      error: { code: '', message: 'Error' },
    });
    expect(result).toEqual({ error: { message: 'Error' } });
  });

  it('rejects empty message', () => {
    expect(
      parseErrorResponse({ error: { code: 'test', message: '' } }),
    ).toBeUndefined();
    expect(
      parseErrorResponse({ error: { code: 'test', message: '   ' } }),
    ).toBeUndefined();
  });

  it.each([
    undefined,
    null,
    {},
    { error: null },
    { error: [] },
    { notError: {} },
  ])('returns undefined for invalid structure: %o', (input) => {
    expect(parseErrorResponse(input)).toBeUndefined();
  });

  it('ignores unknown fields', () => {
    const result = parseErrorResponse({
      error: {
        code: 'test',
        message: 'Error',
        requestId: 'req_123',
        metadata: { key: 'value' },
      },
    });
    expect(result).toEqual({
      error: { code: 'test', message: 'Error' },
    });
    const obj = result?.error as unknown as Record<string, unknown>;
    expect(obj['requestId']).toBeUndefined();
    expect(obj['metadata']).toBeUndefined();
  });
});
