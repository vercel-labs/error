import { describe, it, expect } from 'vitest';

import { getRootCause } from '.';
import { VercelError } from '../vercel-error';

describe('getRootCause', () => {
  it('returns the error itself when no cause', () => {
    const error = new Error('test');
    expect(getRootCause(error)).toBe(error);
  });

  it('traverses a single cause', () => {
    const root = new Error('root');
    const error = new Error('wrapper', { cause: root });
    expect(getRootCause(error)).toBe(root);
  });

  it('traverses a deep cause chain', () => {
    const root = new Error('root');
    const mid = new Error('mid', { cause: root });
    const top = new Error('top', { cause: mid });
    expect(getRootCause(top)).toBe(root);
  });

  it('handles VercelError cause chains', () => {
    const root = new VercelError('root', { code: 'root' });
    const wrapper = new VercelError('wrapper', {
      code: 'wrapper',
      cause: root,
    });
    expect(getRootCause(wrapper)).toBe(root);
  });

  it('detects cycles and returns last visited', () => {
    const a: Record<string, unknown> = { message: 'a' };
    const b: Record<string, unknown> = { message: 'b', cause: a };
    a['cause'] = b;
    const result = getRootCause(a);
    expect(result).toBeDefined();
  });

  it('returns non-object values as-is', () => {
    expect(getRootCause('string')).toBe('string');
    expect(getRootCause(42)).toBe(42);
    expect(getRootCause(null)).toBe(null);
    expect(getRootCause(undefined)).toBe(undefined);
  });

  it('returns object without cause as-is', () => {
    const obj = { message: 'test' };
    expect(getRootCause(obj)).toBe(obj);
  });
});
