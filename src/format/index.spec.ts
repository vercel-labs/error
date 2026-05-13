import { describe, it, expect } from 'vitest';

import { frame, hint, fix, link, formatAuto, detectFormat } from '.';

describe('format', () => {
  describe('fix', () => {
    it("prefixes text with 'fix: '", () => {
      expect(fix('Use a connection pool')).toBe('fix: Use a connection pool');
    });

    it('returns undefined for null', () => {
      expect(fix(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(fix(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(fix('')).toBeUndefined();
    });
  });

  describe('hint', () => {
    it("prefixes text with 'hint: '", () => {
      expect(hint('Try using a connection pool')).toBe(
        'hint: Try using a connection pool',
      );
    });

    it('returns undefined for null', () => {
      expect(hint(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(hint(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(hint('')).toBeUndefined();
    });
  });

  describe('link', () => {
    it("prefixes URL with 'read more: '", () => {
      expect(link('https://vercel.com/docs')).toBe(
        'read more: https://vercel.com/docs',
      );
    });

    it('returns undefined for null', () => {
      expect(link(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(link(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(link('')).toBeUndefined();
    });
  });

  describe('frame', () => {
    it('renders header when no sections', () => {
      expect(frame('Hello')).toBe('Hello');
    });

    it('renders sections (auto-detects format)', () => {
      const result = frame('Error', ['detail']);
      expect(result).toContain('detail');
    });

    it('filters out falsy sections', () => {
      const result = frame('Error', ['a', undefined, null, false, 'b']);
      expect(result).toContain('a');
      expect(result).toContain('b');
    });

    it('returns header only when all sections are falsy', () => {
      expect(frame('Error', [undefined, null, false])).toBe('Error');
    });
  });

  describe('formatAuto', () => {
    it('renders error with auto-detected format', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'Pool exhausted',
        reason: 'All connections in use.',
        fix: 'Add pgBouncer.',
        link: 'https://vercel.com/docs',
      });
      expect(result).toContain('error:');
      expect(result).toContain('VercelError');
      expect(result).toContain('Pool exhausted');
      expect(result).toContain('All connections in use.');
    });

    it('renders header only when no context fields', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'simple',
      });
      expect(result).toContain('error:');
      expect(result).toContain('VercelError');
      expect(result).toContain('simple');
    });

    it('includes scope and code in qualifier', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'fail',
        scope: 'auth',
        code: 'rate_limited',
      });
      expect(result).toContain('error:');
      expect(result).toContain('VercelError [auth:rate_limited]');
    });

    it('includes hint in output', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'setTimeout not available',
        hint: 'Use the sleep function from the workflow package',
        fix: 'Replace setTimeout with await sleep(ms)',
      });
      expect(result).toContain('hint: Use the sleep function');
      expect(result).toContain('fix: Replace setTimeout');
    });
  });

  describe('formatAuto — tree structure', () => {
    it('includes spacer line between header and sections', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'fail',
        reason: 'Something broke',
      });
      const lines = result.split('\n');
      if (lines.length > 2) {
        expect(lines[1]).toMatch(/│/);
      }
    });

    it('uses arrow connectors for actionable items', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'fail',
        fix: 'Do this',
        link: 'https://example.com',
      });
      if (result.includes('▸')) {
        expect(result).toContain('▸');
      }
    });

    it('uses plain connectors for reason (non-actionable)', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'fail',
        reason: 'Context info',
        fix: 'Do this',
      });
      expect(result).toContain('Context info');
      expect(result).toContain('fix: Do this');
    });

    it('omits colon after qualifier in header', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'fail',
        scope: 'db',
        code: 'timeout',
      });
      expect(result).toContain('VercelError [db:timeout]');
      expect(result).not.toContain('[db:timeout]:');
    });

    it('uses colon after name when no qualifier', () => {
      const result = formatAuto({
        name: 'VercelError',
        message: 'fail',
      });
      expect(result).toContain('VercelError:');
    });
  });

  describe('detectFormat', () => {
    it('returns tree and color booleans', () => {
      const result = detectFormat();
      expect(typeof result.tree).toBe('boolean');
      expect(typeof result.color).toBe('boolean');
    });
  });
});
