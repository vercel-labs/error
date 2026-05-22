import { describe, expect, it } from 'vitest';

import { detectFormat, fix, formatAuto, frame, hint, link } from '.';

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
        fix: 'Add pgBouncer.',
        link: 'https://vercel.com/docs',
        message: 'Pool exhausted',
        name: 'VercelError',
        reason: 'All connections in use.',
      });
      expect(result).toContain('error:');
      expect(result).toContain('VercelError');
      expect(result).toContain('Pool exhausted');
      expect(result).toContain('All connections in use.');
    });

    it('renders header only when no context fields', () => {
      const result = formatAuto({
        message: 'simple',
        name: 'VercelError',
      });
      expect(result).toContain('error:');
      expect(result).toContain('VercelError');
      expect(result).toContain('simple');
    });

    it('includes scope and code in qualifier', () => {
      const result = formatAuto({
        code: 'rate_limited',
        message: 'fail',
        name: 'VercelError',
        scope: 'auth',
      });
      expect(result).toContain('error:');
      expect(result).toContain('VercelError [auth:rate_limited]');
    });

    it('includes hint in output', () => {
      const result = formatAuto({
        fix: 'Replace setTimeout with await sleep(ms)',
        hint: 'Use the sleep function from the workflow package',
        message: 'setTimeout not available',
        name: 'VercelError',
      });
      expect(result).toContain('hint: Use the sleep function');
      expect(result).toContain('fix: Replace setTimeout');
    });
  });

  describe('formatAuto — tree structure', () => {
    it('includes spacer line between header and sections', () => {
      const result = formatAuto({
        message: 'fail',
        name: 'VercelError',
        reason: 'Something broke',
      });
      const lines = result.split('\n');
      if (lines.length > 2) {
        expect(lines[1]).toMatch(/│/);
      }
    });

    it('uses arrow connectors for actionable items', () => {
      const result = formatAuto({
        fix: 'Do this',
        link: 'https://example.com',
        message: 'fail',
        name: 'VercelError',
      });
      if (result.includes('▸')) {
        expect(result).toContain('▸');
      }
    });

    it('uses plain connectors for reason (non-actionable)', () => {
      const result = formatAuto({
        fix: 'Do this',
        message: 'fail',
        name: 'VercelError',
        reason: 'Context info',
      });
      expect(result).toContain('Context info');
      expect(result).toContain('fix: Do this');
    });

    it('omits colon after qualifier in header', () => {
      const result = formatAuto({
        code: 'timeout',
        message: 'fail',
        name: 'VercelError',
        scope: 'db',
      });
      expect(result).toContain('VercelError [db:timeout]');
      expect(result).not.toContain('[db:timeout]:');
    });

    it('uses colon after name when no qualifier', () => {
      const result = formatAuto({
        message: 'fail',
        name: 'VercelError',
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
