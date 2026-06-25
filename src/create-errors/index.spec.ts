import { describe, expect, it, vi } from 'vitest';

import { createErrors } from '.';
import { VercelError } from '../vercel-error';

describe('createErrors', () => {
  it('always returns create, raise, and report', () => {
    const errors = createErrors({ scope: 'auth' });
    expect(errors.create).toBeTypeOf('function');
    expect(errors.raise).toBeTypeOf('function');
    expect(errors.report).toBeTypeOf('function');
  });

  describe('optional scope', () => {
    it('works with no options at all', () => {
      const errors = createErrors();
      const error = errors.create('failed');
      expect(error).toBeInstanceOf(VercelError);
      expect(error.scope).toBeUndefined();
      expect(error.message).toBe('failed');
    });

    it('works when options are provided without a scope', () => {
      const report = vi.fn();
      const errors = createErrors({ report });
      const error = errors.report('boom', { code: 'oops' });
      expect(error.scope).toBeUndefined();
      expect(error.code).toBe('oops');
      expect(report).toHaveBeenCalledWith(error);
    });
  });

  describe('create', () => {
    it('creates a VercelError with scope applied', () => {
      const errors = createErrors({ scope: 'auth' });
      const error = errors.create('failed');
      expect(error).toBeInstanceOf(VercelError);
      expect(error.scope).toBe('auth');
      expect(error.message).toBe('failed');
    });

    it('merges default attributes', () => {
      const errors = createErrors({
        attributes: { 'service.name': 'postgres' },
        scope: 'db',
      });
      const error = errors.create('fail', {
        attributes: { 'db.query': 'SELECT' },
      });
      expect(error.attributes).toEqual({
        'db.query': 'SELECT',
        'service.name': 'postgres',
      });
    });

    it('merges default metadata', () => {
      const errors = createErrors({
        metadata: { pool: 'primary' },
        scope: 'db',
      });
      const error = errors.create('fail', {
        metadata: { query: 'SELECT' },
      });
      expect(error.metadata).toEqual({
        pool: 'primary',
        query: 'SELECT',
      });
    });
  });

  describe('raise', () => {
    it('throws a VercelError', () => {
      const errors = createErrors({ scope: 'auth' });
      expect(() => errors.raise('denied')).toThrow(VercelError);
    });

    it('does not call the reporter', () => {
      const report = vi.fn();
      const errors = createErrors({ report, scope: 'auth' });
      try {
        errors.raise('denied');
      } catch {
        // Expected
      }
      expect(report).not.toHaveBeenCalled();
    });
  });

  describe('report', () => {
    it('calls custom reporter, creates and returns the error', () => {
      const report = vi.fn();
      const errors = createErrors({ report, scope: 'analytics' });
      const error = errors.report('tracking failed');

      expect(error).toBeInstanceOf(VercelError);
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(error);
    });

    it('defaults to console.error when no reporter provided', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {
        // no-op
      });
      const errors = createErrors({ scope: 'fallback' });
      const error = errors.report('something broke');

      expect(error).toBeInstanceOf(VercelError);
      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(error);
      spy.mockRestore();
    });
  });

  describe('destructuring', () => {
    it('supports destructuring all methods', () => {
      const { create, raise, report } = createErrors({ scope: 'test' });
      expect(create).toBeTypeOf('function');
      expect(raise).toBeTypeOf('function');
      expect(report).toBeTypeOf('function');
    });
  });

  describe('type-safe codes', () => {
    it('accepts typed error codes', () => {
      const errors = createErrors<'rate_limited' | 'expired'>({
        scope: 'auth',
      });
      const error = errors.create('denied', { code: 'rate_limited' });
      expect(error.code).toBe('rate_limited');
    });
  });

  describe('custom ErrorClass', () => {
    class DatabaseError extends VercelError {
      readonly retryable: boolean;
      constructor(
        message: string,
        options: ConstructorParameters<typeof VercelError>[1] = {},
      ) {
        super(message, options);
        this.name = 'DatabaseError';
        this.retryable = true;
      }
    }

    it('creates instances of the custom class', () => {
      const errors = createErrors({
        ErrorClass: DatabaseError,
        scope: 'db',
      });
      const error = errors.create('connection lost');
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error).toBeInstanceOf(VercelError);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('DatabaseError');
      expect(error.scope).toBe('db');
    });

    it('raise throws the custom class', () => {
      const errors = createErrors({
        ErrorClass: DatabaseError,
        scope: 'db',
      });
      try {
        errors.raise('pool exhausted');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect((error as DatabaseError).retryable).toBe(true);
      }
    });

    it('report returns the custom class', () => {
      const report = vi.fn();
      const errors = createErrors({
        ErrorClass: DatabaseError,
        report,
        scope: 'db',
      });
      const error = errors.report('query timeout');
      expect(error).toBeInstanceOf(DatabaseError);
      expect(report).toHaveBeenCalledWith(error);
    });

    it('merges attributes and metadata with custom class', () => {
      const errors = createErrors({
        ErrorClass: DatabaseError,
        attributes: { 'service.name': 'postgres' },
        metadata: { pool: 'primary' },
        scope: 'db',
      });
      const error = errors.create('fail', {
        attributes: { 'db.query': 'SELECT' },
        metadata: { shard: '3' },
      });
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.attributes).toEqual({
        'db.query': 'SELECT',
        'service.name': 'postgres',
      });
      expect(error.metadata).toEqual({
        pool: 'primary',
        shard: '3',
      });
    });

    it('defaults to VercelError when ErrorClass is not provided', () => {
      const errors = createErrors({ scope: 'default' });
      const error = errors.create('test');
      expect(error).toBeInstanceOf(VercelError);
      expect(error.constructor).toBe(VercelError);
    });
  });

  describe('docsBaseUrl', () => {
    it('derives link from a string base and the code', () => {
      const errors = createErrors({
        docsBaseUrl: 'https://vercel.com/docs/errors/db',
        scope: 'db',
      });
      const error = errors.create('fail', { code: 'pool_exhausted' });
      expect(error.link).toBe(
        'https://vercel.com/docs/errors/db/pool_exhausted',
      );
    });

    it('appends the code verbatim without changing its case', () => {
      const errors = createErrors({ docsBaseUrl: 'https://e.dev' });
      const error = errors.create('fail', { code: 'E1001' });
      expect(error.link).toBe('https://e.dev/E1001');
    });

    it('trims trailing slashes from a string base', () => {
      const errors = createErrors({ docsBaseUrl: 'https://e.dev/errors//' });
      const error = errors.create('fail', { code: 'timeout' });
      expect(error.link).toBe('https://e.dev/errors/timeout');
    });

    it('derives link from a function base', () => {
      const errors = createErrors({
        docsBaseUrl: (code) => `https://e.dev/${code}?ref=docs`,
      });
      const error = errors.create('fail', { code: 'timeout' });
      expect(error.link).toBe('https://e.dev/timeout?ref=docs');
    });

    it('skips derivation when there is no code', () => {
      const errors = createErrors({ docsBaseUrl: 'https://e.dev' });
      const error = errors.create('fail');
      expect(error.link).toBeUndefined();
    });

    it('lets an explicit per-error link win over docsBaseUrl', () => {
      const errors = createErrors({ docsBaseUrl: 'https://e.dev' });
      const error = errors.create('fail', {
        code: 'timeout',
        link: 'https://custom.example/timeout',
      });
      expect(error.link).toBe('https://custom.example/timeout');
    });

    it('skips derivation when the function base returns undefined', () => {
      const errors = createErrors({ docsBaseUrl: () => undefined });
      const error = errors.create('fail', { code: 'timeout' });
      expect(error.link).toBeUndefined();
    });

    it('does not set a link when docsBaseUrl is not provided', () => {
      const errors = createErrors({ scope: 'db' });
      const error = errors.create('fail', { code: 'timeout' });
      expect(error.link).toBeUndefined();
    });
  });
});
