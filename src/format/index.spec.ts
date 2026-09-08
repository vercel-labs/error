import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectFormat,
  fix,
  formatError,
  frame,
  hint,
  link,
  type ErrorFormat,
} from '.';

/* oxlint-disable no-control-regex -- intentional ANSI/control assertions */
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('format', () => {
  describe('structured sections', () => {
    it('returns typed hint, fix, and link sections', () => {
      expect(hint('Try a smaller request')).toEqual({
        kind: 'hint',
        text: 'Try a smaller request',
      });
      expect(fix('Reduce the request size')).toEqual({
        kind: 'fix',
        text: 'Reduce the request size',
      });
      expect(link('https://docs.example.com')).toEqual({
        kind: 'link',
        text: 'https://docs.example.com',
      });
    });

    it.each([hint, fix, link])(
      'returns undefined for nil or empty text',
      (fn) => {
        expect(fn(undefined)).toBeUndefined();
        expect(fn(null)).toBeUndefined();
        expect(fn('')).toBeUndefined();
      },
    );

    it('does not infer semantics from prefixes in raw details', () => {
      expect(
        frame('Error', ['hint: raw detail', hint('Structured hint')], {
          format: 'tree',
        }),
      ).toBe(
        [
          'Error',
          '│',
          '├── hint: raw detail',
          '╰─▸ hint: Structured hint',
        ].join('\n'),
      );
    });
  });

  describe('presets', () => {
    const error = {
      code: 'timeout',
      fix: 'Retry the request',
      hint: 'Check service health',
      link: 'https://status.example.com',
      message: 'Request timed out',
      name: 'VercelError',
      reason: 'The upstream did not respond',
      scope: 'payments',
    };

    it('renders plain without tree connectors or color', () => {
      expect(formatError(error, { format: 'plain' })).toBe(
        [
          'error: VercelError [payments:timeout] Request timed out',
          '  The upstream did not respond',
          '  hint: Check service health',
          '  fix: Retry the request',
          '  read more: https://status.example.com',
        ].join('\n'),
      );
    });

    it('renders tree connectors without color', () => {
      expect(formatError(error, { format: 'tree' })).toBe(
        [
          'error: VercelError [payments:timeout] Request timed out',
          '│',
          '├── The upstream did not respond',
          '├─▸ hint: Check service health',
          '├─▸ fix: Retry the request',
          '╰─▸ read more: https://status.example.com',
        ].join('\n'),
      );
    });

    it('renders ANSI with tree connectors and color without ambient detection', () => {
      vi.stubGlobal('process', {
        env: { NO_COLOR: '1' },
        stdout: { isTTY: false },
      });

      const result = formatError(error, { format: 'ansi' });
      expect(result).toContain('\x1b[');
      expect(stripAnsi(result)).toBe(formatError(error, { format: 'tree' }));
    });

    it.each(['plain', 'tree', 'ansi'] as const)(
      'keeps explicit %s output stable across ambient changes',
      (format) => {
        vi.stubGlobal('process', {
          env: { FORCE_COLOR: '1' },
          stdout: { isTTY: true },
        });
        const first = formatError(error, { format });

        vi.stubGlobal('process', {
          env: { NO_COLOR: '1' },
          stdout: { isTTY: false },
        });
        expect(formatError(error, { format })).toBe(first);
      },
    );

    it('defaults a missing cross-realm name to VercelError', () => {
      expect(formatError({ message: 'Failed' }, { format: 'plain' })).toBe(
        'error: VercelError: Failed',
      );
    });
  });

  describe('auto detection', () => {
    it.each([
      [undefined, false, false, false],
      [{}, false, false, false],
      [{ NO_COLOR: '' }, true, true, false],
      [{ FORCE_COLOR: '1' }, false, true, true],
      [{}, true, true, true],
    ] as const)(
      'maps environment %o and TTY %s to tree=%s color=%s',
      (env, isTTY, tree, color) => {
        if (env === undefined) {
          vi.stubGlobal('process', undefined);
        } else {
          vi.stubGlobal('process', { env, stdout: { isTTY } });
        }

        expect(detectFormat()).toEqual({ color, tree });
      },
    );

    it('gives NO_COLOR precedence over FORCE_COLOR', () => {
      vi.stubGlobal('process', {
        env: { FORCE_COLOR: '1', NO_COLOR: '1' },
        stdout: { isTTY: true },
      });
      expect(detectFormat()).toEqual({ color: false, tree: true });
    });

    it('uses detected capabilities only for auto', () => {
      vi.stubGlobal('process', {
        env: { FORCE_COLOR: '1' },
        stdout: { isTTY: false },
      });
      const error = { message: 'Failed' };

      expect(formatError(error)).toContain('\x1b[');
      expect(formatError(error, { format: 'auto' })).toContain('\x1b[');
      expect(formatError(error, { format: 'plain' })).not.toContain('\x1b[');
    });
  });

  describe('multiline containment', () => {
    const fields = [
      'name',
      'message',
      'scope',
      'code',
      'reason',
      'hint',
      'fix',
      'link',
    ] as const;

    it.each(fields)(
      'frames every physical line supplied through %s',
      (field) => {
        const error = {
          message: 'Failed',
          name: 'VercelError',
          [field]: 'safe\r\nforged\rbad\n\nlast',
        };

        for (const format of ['plain', 'tree', 'ansi'] as const) {
          const output = stripAnsi(formatError(error, { format }));
          expect(output).not.toContain('\r');
          const continuationLines = output.split('\n').slice(1);
          const prefix = format === 'plain' ? /^ {2}/ : /^(?:│|├|╰)/;
          expect(continuationLines.length).toBeGreaterThan(0);
          expect(continuationLines.every((line) => prefix.test(line))).toBe(
            true,
          );
          expect(continuationLines).not.toContain('forgedbad');
          expect(continuationLines).not.toContain('last');
        }
      },
    );

    it('frames multiline raw and structured frame sections', () => {
      expect(
        frame(
          'Header\ncontinued',
          ['detail\ncontinued', hint('hint\ncontinued'), '\n'],
          { format: 'tree' },
        ),
      ).toBe(
        [
          'Header',
          '│ continued',
          '│',
          '├── detail',
          '│   continued',
          '├─▸ hint: hint',
          '│   continued',
          '╰── ',
          '│   ',
        ].join('\n'),
      );
    });

    it('preserves tabs while normalizing CRLF and removing bare CR', () => {
      expect(
        frame('Header', ['one\r\ntwo\rthree\tfour'], { format: 'plain' }),
      ).toBe('Header\n  one\n  twothree\tfour');
    });
  });

  describe('control-character sanitization', () => {
    const ESC = '\x1b';

    it('strips CSI, OSC, C1, DEL, and unsafe C0 controls from every field', () => {
      const hostile = `safe${ESC}[31mred${ESC}[0m${ESC}]52;c;ZXZpbA==${ESC}\\end\x9b\x7f\x00`;
      const output = formatError(
        {
          code: hostile,
          fix: hostile,
          hint: hostile,
          link: hostile,
          message: hostile,
          name: hostile,
          reason: hostile,
          scope: hostile,
        },
        { format: 'tree' },
      );

      expect(output).not.toContain(ESC);
      expect(output).not.toMatch(/[\x00\x7f-\x9f]/);
      expect(output).toContain('saferedend');
    });

    it('sanitizes raw and structured frame sections at render time', () => {
      const result = frame(
        `${ESC}]8;;https://evil.example${ESC}\\Header`,
        [`raw${ESC}[2K`, fix(`fix${ESC}[31m`)],
        { format: 'tree' },
      );

      expect(result).not.toContain(ESC);
      expect(result).toContain('Header');
      expect(result).toContain('raw');
      expect(result).toContain('fix: fix');
    });

    it('rejects malformed structured sections before rendering', () => {
      expect(() =>
        frame('Header', [{ kind: 'hint\nforged', text: 'unsafe' } as never], {
          format: 'tree',
        }),
      ).toThrow(TypeError);
      expect(() =>
        frame('Header', [{ kind: 'hint', text: 123 } as never], {
          format: 'tree',
        }),
      ).toThrow(TypeError);
    });

    it(
      'sanitizes large unterminated OSC input without pathological rescanning',
      { timeout: 1000 },
      () => {
        const hostile = `${'\x1b]'.repeat(65_536)}visible`;
        const output = formatError({ message: hostile }, { format: 'tree' });

        expect(output).not.toContain('\x1b');
      },
    );
  });

  it.each(['auto', 'plain', 'tree', 'ansi'] satisfies ErrorFormat[])(
    'accepts the %s ErrorFormat preset',
    (format) => {
      expect(formatError({ message: 'Failed' }, { format })).toContain(
        'VercelError',
      );
    },
  );
});
/* oxlint-enable no-control-regex */
