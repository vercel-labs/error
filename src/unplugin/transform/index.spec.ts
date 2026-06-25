import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';

import { transform } from '.';

function run(code: string): string | null {
  const result = transform(code, 'test.ts');
  return result ? result.code : null;
}

/** Assert the output parses cleanly (no dangling commas or broken objects). */
function expectValid(code: string | null): string {
  expect(code).not.toBeNull();
  const { errors } = parseSync('out.ts', code as string);
  expect(errors).toEqual([]);
  return code as string;
}

describe('transform: new VercelError', () => {
  it('blanks the message argument', () => {
    const out = run(
      `import { VercelError } from '@vercel/error';\n` +
        `throw new VercelError('Connection failed', { code: 'conn_failed' });`,
    );
    expect(out).toContain("new VercelError(''");
    expect(out).not.toContain('Connection failed');
    expect(out).toContain("code: 'conn_failed'");
  });

  it('removes prose props but keeps structured fields', () => {
    const out = run(
      `import { VercelError } from '@vercel/error';\n` +
        `new VercelError('boom', {\n` +
        `  code: 'x',\n` +
        `  scope: 'db',\n` +
        `  statusCode: 503,\n` +
        `  link: 'https://e.dev/x',\n` +
        `  reason: 'why it broke',\n` +
        `  hint: 'try this',\n` +
        `  fix: 'do that',\n` +
        `  userMessage: 'safe message',\n` +
        `});`,
    );
    expect(out).not.toContain('why it broke');
    expect(out).not.toContain('try this');
    expect(out).not.toContain('do that');
    expect(out).not.toContain('safe message');
    expect(out).toContain("code: 'x'");
    expect(out).toContain("scope: 'db'");
    expect(out).toContain('statusCode: 503');
    expect(out).toContain("link: 'https://e.dev/x'");
  });

  it('handles aliased imports', () => {
    const out = run(
      `import { VercelError as VE } from '@vercel/error';\n` +
        `new VE('secret', { code: 'x', reason: 'r' });`,
    );
    expect(out).not.toContain('secret');
    expect(out).not.toContain('reason');
    expect(out).toContain("code: 'x'");
  });

  it('strips a blank object cleanly when only prose is present', () => {
    const out = run(
      `import { VercelError } from '@vercel/error';\n` +
        `new VercelError('msg', { reason: 'r' });`,
    );
    expect(out).not.toContain('reason');
    expect(out).not.toContain("'r'");
  });

  it('produces valid JS for mixed prop positions (first, middle, last)', () => {
    const out = expectValid(
      run(
        `import { VercelError } from '@vercel/error';\n` +
          `new VercelError('a', { reason: 'r', code: 'x', scope: 'db' });\n` +
          `new VercelError('b', { code: 'x', hint: 'h', scope: 'db' });\n` +
          `new VercelError('c', { code: 'x', scope: 'db', fix: 'f' });`,
      ),
    );
    expect(out).not.toMatch(/reason|hint|fix/);
    expect(out).not.toContain(',,');
  });

  it('produces valid JS for adjacent prose props', () => {
    const out = expectValid(
      run(
        `import { VercelError } from '@vercel/error';\n` +
          // adjacent prose, last is prose
          `new VercelError('a', { code: 'x', reason: 'r', hint: 'h' });\n` +
          // all prose then structured
          `new VercelError('b', { reason: 'r', hint: 'h', fix: 'f', code: 'x' });`,
      ),
    );
    expect(out).not.toMatch(/reason|hint|fix/);
    expect(out).toMatch(/code: 'x'/);
  });

  it('handles a trailing comma after the last prose prop', () => {
    const out = expectValid(
      run(
        `import { VercelError } from '@vercel/error';\n` +
          `new VercelError('a', { code: 'x', reason: 'r', });`,
      ),
    );
    expect(out).not.toContain('reason');
    expect(out).toContain("code: 'x'");
  });
});

describe('transform: createErrors factory', () => {
  it('strips raise/create/report calls on a tracked factory', () => {
    const out = run(
      `import { createErrors } from '@vercel/error';\n` +
        `const errors = createErrors({ scope: 'db' });\n` +
        `errors.raise('Timeout', { code: 'timeout', hint: 'wait' });\n` +
        `errors.create('Other', { code: 'other', fix: 'retry' });`,
    );
    expect(out).not.toContain('Timeout');
    expect(out).not.toContain('wait');
    expect(out).not.toContain('Other');
    expect(out).not.toContain('retry');
    expect(out).toContain("code: 'timeout'");
    expect(out).toContain("code: 'other'");
  });
});

describe('transform: safety', () => {
  it('returns null when the package is not imported', () => {
    expect(
      run(`class VercelError {}\nnew VercelError('keep me', {});`),
    ).toBeNull();
  });

  it('ignores a VercelError-named symbol from another module', () => {
    expect(
      run(
        `import { VercelError } from 'somewhere-else';\n` +
          `new VercelError('keep me', { reason: 'keep' });`,
      ),
    ).toBeNull();
  });

  it('leaves spread option objects intact', () => {
    const code =
      `import { VercelError } from '@vercel/error';\n` +
      `const base = { reason: 'r' };\n` +
      `new VercelError('msg', { ...base, code: 'x' });`;
    const out = run(code);
    // message is still blanked, but the spread object is untouched
    expect(out).toContain('...base');
    expect(out).toContain('reason'); // inside base, not removed
  });

  it('leaves a dynamic (non-literal) message intact', () => {
    const out = run(
      `import { VercelError } from '@vercel/error';\n` +
        `const m = 'x';\n` +
        `new VercelError(m, { code: 'x', reason: 'r' });`,
    );
    // message variable preserved, but prose prop still removed
    expect(out).toContain('new VercelError(m,');
    expect(out).not.toContain("reason: 'r'");
  });

  it('does not strip factory calls on untracked objects', () => {
    expect(
      run(
        `import { createErrors } from '@vercel/error';\n` +
          `const other = { raise: (m) => m };\n` +
          `other.raise('keep me');`,
      ),
    ).toBeNull();
  });
});

describe('transform: count', () => {
  it('reports the number of stripped call sites', () => {
    const result = transform(
      `import { VercelError, createErrors } from '@vercel/error';\n` +
        `const errors = createErrors({ scope: 'db' });\n` +
        `new VercelError('a', { code: 'x' });\n` +
        `errors.raise('b', { code: 'y' });`,
      'test.ts',
    );
    expect(result?.count).toBe(2);
  });
});
