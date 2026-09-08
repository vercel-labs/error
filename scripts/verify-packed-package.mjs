import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = mkdtempSync(join(tmpdir(), 'vercel-error-packed-'));
const packDirectory = join(workspace, 'package');
const consumerDirectory = join(workspace, 'consumer');

function main() {
  try {
    execFileSync('mkdir', [packDirectory, consumerDirectory]);
    execFileSync('pnpm', ['pack', '--pack-destination', packDirectory], {
      cwd: packageRoot,
      stdio: 'inherit',
    });

    const tarballName = readdirSync(packDirectory).find((name) =>
      name.endsWith('.tgz'),
    );
    if (!tarballName) throw new Error('pnpm pack did not produce a tarball');
    const tarball = join(packDirectory, tarballName);

    writeFileSync(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({ name: 'vercel-error-packed-consumer', private: true }),
    );
    execFileSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--no-package-lock',
        tarball,
      ],
      { cwd: consumerDirectory, stdio: 'inherit' },
    );

    writeFileSync(
      join(consumerDirectory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          lib: ['ES2023', 'DOM', 'DOM.Iterable'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'build',
          strict: true,
          target: 'ES2022',
        },
        include: ['consumer.ts'],
      }),
    );
    writeFileSync(join(consumerDirectory, 'consumer.ts'), consumerFixture);
    writeFileSync(join(consumerDirectory, 'utility.ts'), utilityFixture);

    const tsc = join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    execFileSync(process.execPath, [tsc, '--project', 'tsconfig.json'], {
      cwd: consumerDirectory,
      stdio: 'inherit',
    });

    const runtimeEnvironment = { ...process.env, NO_COLOR: '1' };
    delete runtimeEnvironment.FORCE_COLOR;
    execFileSync(process.execPath, ['build/consumer.js'], {
      cwd: consumerDirectory,
      env: runtimeEnvironment,
      stdio: 'inherit',
    });

    verifyBuiltImports(
      join(consumerDirectory, 'node_modules/@vercel/error/dist'),
    );
    verifyTreeShaking(consumerDirectory);

    console.log('Packed package verification passed.');
  } finally {
    rmSync(workspace, { force: true, recursive: true });
  }
}

function verifyBuiltImports(distDirectory) {
  const files = readdirSync(distDirectory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => join(distDirectory, name));
  const fileSet = new Set(files);
  const graph = new Map();
  const installedPackageRoot = resolve(distDirectory, '..');
  const installedPackage = JSON.parse(
    readFileSync(join(installedPackageRoot, 'package.json'), 'utf8'),
  );
  const entryNames = new Set();

  for (const target of Object.values(installedPackage.exports)) {
    if (
      typeof target !== 'object' ||
      target === null ||
      typeof target.default !== 'string' ||
      typeof target.types !== 'string'
    ) {
      throw new Error('Every package export must declare default and types');
    }

    const runtimeTarget = resolve(installedPackageRoot, target.default);
    const typeTarget = resolve(installedPackageRoot, target.types);
    if (!fileSet.has(runtimeTarget)) {
      throw new Error(`Missing packed runtime export ${target.default}`);
    }
    if (!existsSync(typeTarget)) {
      throw new Error(`Missing packed type export ${target.types}`);
    }
    entryNames.add(basename(runtimeTarget));
  }

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const dependencies = [];
    for (const match of source.matchAll(
      /(?:from\s+|import\s*)["'](\.\.?\/[^"']+)["']/g,
    )) {
      const dependency = resolve(dirname(file), match[1]);
      if (fileSet.has(dependency)) dependencies.push(dependency);
      if (
        entryNames.has(match[1].replace(/^\.\//, '')) &&
        entryNames.has(file.slice(distDirectory.length + 1))
      ) {
        throw new Error(
          `Public entry ${file} imports another public entry ${match[1]}`,
        );
      }
    }
    graph.set(file, dependencies);
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(file) {
    if (visiting.has(file)) {
      throw new Error(`Built import cycle detected at ${file}`);
    }
    if (visited.has(file)) return;

    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of files) visit(file);
}

function verifyTreeShaking(directory) {
  const tsdown = join(packageRoot, 'node_modules', '.bin', 'tsdown');
  execFileSync(
    tsdown,
    [
      'utility.ts',
      '--no-config',
      '--format',
      'esm',
      '--out-dir',
      'tree-shaken',
      '--logLevel',
      'error',
    ],
    { cwd: directory, stdio: 'inherit' },
  );

  const bundleDirectory = join(directory, 'tree-shaken');
  const bundleName = readdirSync(bundleDirectory).find((name) =>
    /\.[cm]?js$/.test(name),
  );
  if (!bundleName) throw new Error('tsdown did not emit a utility bundle');
  const bundle = readFileSync(join(bundleDirectory, bundleName), 'utf8');
  for (const forbidden of [
    'VercelError',
    'An error occurred.',
    'formatError',
    'projectErrorResponse',
  ]) {
    if (bundle.includes(forbidden)) {
      throw new Error(`Tree-shaken utility bundle contains ${forbidden}`);
    }
  }
}

const consumerFixture = String.raw`
import {
  VercelError,
  createErrors,
  hasCode,
  isErrorLike,
  isVercelError,
  type ErrorResponse,
  type VercelErrorOptions,
} from '@vercel/error';
import {
  fromErrorResponse,
  parseErrorResponse,
} from '@vercel/error/client';
import {
  errorResponse,
  wantsAnsi,
} from '@vercel/error/server';
import {
  fix,
  formatError,
  frame,
  hint,
  link,
} from '@vercel/error/format';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type VisitorCode = 'bad_request' | 'unavailable';
let reportedCode: VisitorCode | undefined;
const visitorErrors = createErrors<VisitorCode>({
  scope: 'visitor-signals',
  onReport: (error) => {
    reportedCode = error.code;
  },
});
const reported = visitorErrors.report('Internal visitor failure', {
  code: 'unavailable',
  public: { message: 'Visitor signals are unavailable' },
  statusCode: 503,
});
assert(reportedCode === 'unavailable', 'typed scoped report callback failed');

type CliErrorOptions = VercelErrorOptions<'cli_failure'>;
class CliError extends VercelError<'cli_failure'> {
  readonly retryable = true;
  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, options);
    this.name = 'CliError';
  }
}
const cliErrors = createErrors({ ErrorClass: CliError, scope: 'cli' });
const cliError = cliErrors.create('CLI failed', { code: 'cli_failure' });
assert(cliError.retryable, 'custom constructor inference failed');
assert(hasCode(cliError, 'cli_failure'), 'hasCode failed');
assert(isErrorLike(cliError), 'isErrorLike failed');
const unknownCliError: unknown = cliError;
if (hasCode(unknownCliError, 'cli_failure')) {
  const exactCode: 'cli_failure' = unknownCliError.code;
  assert(exactCode === 'cli_failure', 'hasCode narrowing failed');
}
if (isErrorLike(unknownCliError)) {
  const message: string = unknownCliError.message;
  assert(message === 'CLI failed', 'isErrorLike narrowing failed');
}
if (isVercelError(unknownCliError)) {
  const metadata = unknownCliError.metadata;
  assert(metadata === undefined, 'isVercelError narrowing failed');
}

function verifyTypeContracts(error: CliError, response: ErrorResponse): void {
  error.requestId = 'req_123';
  error.metadata = { operation: 'deploy' };
  error.attributes = { retryable: true };
  // @ts-expect-error authored message is readonly
  error.message = 'changed';
  // @ts-expect-error authored code is readonly
  error.code = 'cli_failure';
  // @ts-expect-error authored status is readonly
  error.statusCode = 500;
  // @ts-expect-error authored public details are readonly
  error.public = { message: 'changed' };
  // @ts-expect-error wire scope cannot be overridden during reconstruction
  fromErrorResponse(response, { scope: 'other' });
  // @ts-expect-error wire code cannot be overridden during reconstruction
  fromErrorResponse(response, { code: 'other' });
  // @ts-expect-error wire public details cannot be overridden during reconstruction
  fromErrorResponse(response, { public: { message: 'other' } });
}
void verifyTypeContracts;

// @ts-expect-error custom subtypes require their matching ErrorClass
createErrors<'cli_failure', CliError>({ scope: 'cli' });
// @ts-expect-error reporting callbacks must be synchronous
createErrors({ onReport: async () => {} });
// @ts-expect-error serialization callbacks must be synchronous
errorResponse({ message: 'Failed' }, { onSerialize: async () => {} });

let serializedStatus: number | undefined;
const json = errorResponse(reported, {
  onSerialize: (_source, context) => {
    serializedStatus = context.status;
  },
});
assert(json.status === 503, 'concrete status was not preserved');
assert(serializedStatus === 503, 'onSerialize did not run');
const parsedJson = parseErrorResponse(JSON.parse(json.body));
assert(parsedJson, 'valid JSON response did not parse');
assert(parsedJson.error.scope === 'visitor-signals', 'scope did not survive');
assert(parsedJson.error.code === 'unavailable', 'code did not survive');
assert(
  !('requestId' in parsedJson.error),
  'server-only requestId reached the wire',
);

const reconstructed = fromErrorResponse(parsedJson, { statusCode: json.status });
assert(
  reconstructed.public?.message === 'Visitor signals are unavailable',
  'public details were not reconstructed',
);

const fallback = errorResponse(new VercelError('Secret developer prose'));
assert(
  JSON.parse(fallback.body).error.message === 'An error occurred.',
  'developer prose leaked through fallback',
);
const ansi = errorResponse(reported, {
  request: new Headers({ 'X-Error-Format': 'ansi' }),
});
assert(ansi.body.includes('\x1b['), 'explicit ANSI consulted ambient NO_COLOR');
assert(
  ansi.body.includes('Visitor signals are unavailable'),
  'ANSI output omitted public prose',
);
assert(
  !ansi.body.includes('Internal visitor failure'),
  'ANSI output disclosed developer prose',
);
assert(
  wantsAnsi(new Headers({ 'X-Error-Format': 'ansi' })),
  'server subpath negotiation failed',
);

assert(
  parseErrorResponse({ error: { hint: false, message: 'Failed' } }) ===
    undefined,
  'strict parsing accepted malformed known fields',
);
let invalidStatusRejected = false;
try {
  errorResponse({ message: 'Failed', statusCode: 399 });
} catch (error) {
  invalidStatusRejected = error instanceof RangeError;
}
assert(invalidStatusRejected, 'invalid status was not rejected');

assert(
  formatError(reconstructed, { format: 'plain' }).includes(
    'Visitor signals are unavailable',
  ),
  'format subpath could not render an error',
);
assert(
  frame('Failed', [hint('Try again'), fix('Retry'), link('https://x.dev')], {
    format: 'tree',
  }).includes('╰─▸'),
  'structured frame sections did not render',
);
`;

const utilityFixture = String.raw`
import { hasCode } from '@vercel/error';

export function isUnavailable(error: unknown): boolean {
  return hasCode(error, 'unavailable');
}
`;

main();
