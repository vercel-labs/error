import { describe, it, expect, vi } from 'vitest';

import { createErrors } from '.';
import { VercelError } from '../vercel-error';

describe('createErrors', () => {
  it('always returns create, raise, and report', () => {
    const errors = createErrors({ scope: 'auth' });
    expect(errors.create).toBeTypeOf('function');
    expect(errors.raise).toBeTypeOf('function');
    expect(errors.report).toBeTypeOf('function');
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
        scope: 'db',
        attributes: { 'service.name': 'postgres' },
      });
      const error = errors.create('fail', {
        attributes: { 'db.query': 'SELECT' },
      });
      expect(error.attributes).toEqual({
        'service.name': 'postgres',
        'db.query': 'SELECT',
      });
    });

    it('merges default metadata', () => {
      const errors = createErrors({
        scope: 'db',
        metadata: { pool: 'primary' },
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
      const errors = createErrors({ scope: 'auth', report });
      try {
        errors.raise('denied');
      } catch {
        // expected
      }
      expect(report).not.toHaveBeenCalled();
    });
  });

  describe('report', () => {
    it('calls custom reporter, creates and returns the error', () => {
      const report = vi.fn();
      const errors = createErrors({ scope: 'analytics', report });
      const error = errors.report('tracking failed');

      expect(error).toBeInstanceOf(VercelError);
      expect(report).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledWith(error);
    });

    it('defaults to console.error when no reporter provided', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
        scope: 'db',
        ErrorClass: DatabaseError,
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
        scope: 'db',
        ErrorClass: DatabaseError,
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
        scope: 'db',
        ErrorClass: DatabaseError,
        report,
      });
      const error = errors.report('query timeout');
      expect(error).toBeInstanceOf(DatabaseError);
      expect(report).toHaveBeenCalledWith(error);
    });

    it('merges attributes and metadata with custom class', () => {
      const errors = createErrors({
        scope: 'db',
        ErrorClass: DatabaseError,
        attributes: { 'service.name': 'postgres' },
        metadata: { pool: 'primary' },
      });
      const error = errors.create('fail', {
        attributes: { 'db.query': 'SELECT' },
        metadata: { shard: '3' },
      });
      expect(error).toBeInstanceOf(DatabaseError);
      expect(error.attributes).toEqual({
        'service.name': 'postgres',
        'db.query': 'SELECT',
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
});
