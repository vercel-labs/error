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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = mkdtempSync(join(tmpdir(), 'vercel-error-packed-'));
const packDirectory = join(workspace, 'package');
const consumerDirectory = join(workspace, 'consumer');

async function main() {
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
    writeFileSync(join(consumerDirectory, 'browser.ts'), browserFixture);
    writeFileSync(
      join(consumerDirectory, 'tsdown.browser.config.mjs'),
      browserBuildConfig,
    );

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
    await verifyBrowserBundle(consumerDirectory);

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

  // Positive control: each forbidden marker must exist in the installed
  // package, so a rename or rewording fails this check loudly instead of
  // letting the absence assertions below pass while asserting nothing.
  const installedDist = join(directory, 'node_modules/@vercel/error/dist');
  const installedSource = readdirSync(installedDist)
    .filter((name) => /\.[cm]?js$/.test(name))
    .map((name) => readFileSync(join(installedDist, name), 'utf8'))
    .join('\n');
  for (const forbidden of [
    'VercelError',
    'An error occurred.',
    'formatError',
    'buildErrorResponseData',
  ]) {
    if (!installedSource.includes(forbidden)) {
      throw new Error(
        `Tree-shaking marker ${forbidden} not found in the installed package; update the marker list`,
      );
    }
    if (bundle.includes(forbidden)) {
      throw new Error(`Tree-shaken utility bundle contains ${forbidden}`);
    }
  }
}

async function verifyBrowserBundle(directory) {
  const tsdown = join(packageRoot, 'node_modules', '.bin', 'tsdown');
  execFileSync(tsdown, ['--config', 'tsdown.browser.config.mjs'], {
    cwd: directory,
    stdio: 'inherit',
    timeout: 60_000,
  });

  const bundleDirectory = join(directory, 'browser-bundle');
  const bundleNames = readdirSync(bundleDirectory).filter((name) =>
    /\.[cm]?js$/.test(name),
  );
  if (bundleNames.length !== 1) {
    throw new Error(
      `Expected one top-level browser JavaScript file, found ${bundleNames.length}`,
    );
  }
  const [bundleName] = bundleNames;
  const bundle = readFileSync(join(bundleDirectory, bundleName), 'utf8');

  if (/\bnode:/.test(bundle)) {
    throw new Error('Browser bundle text matches /\\bnode:/');
  }
  if (/\brequire\s*\(/.test(bundle)) {
    throw new Error('Browser bundle text matches /\\brequire\\s*\\(/');
  }
  if (/\bimport\s*\(/.test(bundle)) {
    throw new Error('Browser bundle text contains a dynamic import');
  }

  const nativeBrandCheckAvailable = runInNewContext(
    "typeof Error.isError === 'function'",
    Object.create(null),
  );
  if (!nativeBrandCheckAvailable) {
    throw new Error('Packed verification runtime has no native Error.isError');
  }

  const installedPackageRoot = join(directory, 'node_modules/@vercel/error');
  const installedPackage = JSON.parse(
    readFileSync(join(installedPackageRoot, 'package.json'), 'utf8'),
  );
  const expectedRuntimeExports = Object.fromEntries(
    await Promise.all(
      Object.entries(installedPackage.exports).map(
        async ([subpath, target]) => [
          subpath,
          Object.keys(
            await import(
              pathToFileURL(resolve(installedPackageRoot, target.default))
            ),
          ).toSorted(),
        ],
      ),
    ),
  );
  const expectedRuntimeExportsJson = JSON.stringify(expectedRuntimeExports);

  for (const scenario of [
    { acceptsTagForgery: false, name: 'native Error.isError', setup: '' },
    {
      acceptsTagForgery: true,
      name: 'Error.isError fallback',
      setup:
        "Object.defineProperty(Error, 'isError', { configurable: true, value: undefined, writable: true });",
    },
  ]) {
    const sandbox = Object.assign(Object.create(null), {
      __vercelErrorAcceptsTagForgery: scenario.acceptsTagForgery,
      document: Object.freeze({}),
      location: Object.freeze({ href: 'https://example.com/' }),
      navigator: Object.freeze({ userAgent: 'packed-browser-check' }),
    });
    sandbox.self = sandbox;
    sandbox.window = sandbox;

    try {
      runInNewContext(`${scenario.setup}\n${bundle}`, sandbox, {
        filename: `vercel-error-browser-${scenario.name}.js`,
        timeout: 5_000,
      });
    } catch (error) {
      throw new Error(
        `Browser fixture failed in Node VM scenario "${scenario.name}"`,
        { cause: error },
      );
    }

    if (sandbox.__vercelErrorBrowserCheckComplete !== true) {
      throw new Error(
        `Browser fixture did not complete in Node VM scenario "${scenario.name}"`,
      );
    }
    if (
      JSON.stringify(sandbox.__vercelErrorExercisedExports) !==
      expectedRuntimeExportsJson
    ) {
      throw new Error(
        `Browser fixture does not exercise every packed runtime export in Node VM scenario "${scenario.name}"`,
      );
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
  type ErrorResponseData,
  type VercelErrorOptions,
} from '@vercel/error';
import {
  fromErrorResponse,
  parseErrorResponse,
  type ErrorResponseData as ClientErrorResponseData,
} from '@vercel/error/client';
import {
  errorResponse,
  wantsAnsi,
  type ErrorResponse,
  type ErrorResponseInput,
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

const publicInput: ErrorResponseInput = {
  message: 'Public input failed',
  statusCode: 400,
};
const publicResponse: ErrorResponse = errorResponse(publicInput);
assert(
  publicResponse.status === 400,
  'ErrorResponseInput status was not preserved in ErrorResponse',
);

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
assert(cliError.retryable, 'custom CliError instance was not retryable');
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

function verifyTypeContracts(
  error: CliError,
  data: ErrorResponseData,
): void {
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
  // @ts-expect-error ErrorResponseData scope cannot be overridden during reconstruction
  fromErrorResponse(data, { scope: 'other' });
  // @ts-expect-error ErrorResponseData code cannot be overridden during reconstruction
  fromErrorResponse(data, { code: 'other' });
  // @ts-expect-error ErrorResponseData public details cannot be overridden during reconstruction
  fromErrorResponse(data, { public: { message: 'other' } });
}
void verifyTypeContracts;

// @ts-expect-error custom subtypes require their matching ErrorClass
createErrors<'cli_failure', CliError>({ scope: 'cli' });
// @ts-expect-error reporting callbacks must be synchronous
createErrors({ onReport: async () => {} });
// @ts-expect-error serialization callbacks must be synchronous
errorResponse({ message: 'Failed' }, { onSerialize: async () => {} });

let serializedStatus: number | undefined;
let serializedBodyFormat: 'json' | 'ansi' | undefined;
const json: ErrorResponse = errorResponse(reported, {
  onSerialize: (_source, context) => {
    serializedBodyFormat = context.bodyFormat;
    serializedStatus = context.status;
  },
});
assert(json.status === 503, 'concrete status was not preserved');
assert(serializedStatus === 503, 'onSerialize did not run');
assert(serializedBodyFormat === 'json', 'JSON body format was not reported');
const parsedJson = parseErrorResponse(JSON.parse(json.body));
assert(parsedJson, 'valid JSON response did not parse');
const clientResponseData: ClientErrorResponseData = parsedJson;
void clientResponseData;
assert(parsedJson.error.scope === 'visitor-signals', 'scope did not survive');
assert(parsedJson.error.code === 'unavailable', 'code did not survive');
assert(
  !('requestId' in parsedJson.error),
  'server-only requestId reached response data',
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
for (const untaggedError of [
  new Error('Secret untagged developer prose'),
  new Proxy(new Error('Secret proxied developer prose'), {}),
]) {
  let untaggedErrorRejected = false;
  try {
    errorResponse(untaggedError);
  } catch (error) {
    untaggedErrorRejected = error instanceof TypeError;
  }
  assert(untaggedErrorRejected, 'untagged Error-like value was serialized');
}
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

const browserBuildConfig = String.raw`
export default {
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  entry: ['browser.ts'],
  format: ['iife'],
  logLevel: 'error',
  outDir: 'browser-bundle',
  platform: 'browser',
  target: 'es2022',
};
`;

const browserFixture = String.raw`
import * as root from '@vercel/error';
import * as client from '@vercel/error/client';
import * as server from '@vercel/error/server';
import * as format from '@vercel/error/format';

const {
  VercelError,
  createErrors,
  getMessage,
  getRootCause,
  hasCode,
  isError,
  isErrorLike,
  isVercelError,
} = root;
const { fromErrorResponse, parseErrorResponse } = client;
const { errorResponse, wantsAnsi } = server;
const { fix, formatError, frame, hint, link } = format;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const nodeGlobal of ['process', 'Buffer', 'require']) {
  assert(
    !(nodeGlobal in globalThis),
    'Node VM sandbox unexpectedly exposes global ' + nodeGlobal,
  );
}

const runtimeExports = {
  '.': {
    VercelError,
    createErrors,
    getMessage,
    getRootCause,
    hasCode,
    isError,
    isErrorLike,
    isVercelError,
  },
  './client': { fromErrorResponse, parseErrorResponse },
  './server': { errorResponse, wantsAnsi },
  './format': { fix, formatError, frame, hint, link },
};
for (const [subpath, exports] of Object.entries(runtimeExports)) {
  for (const [name, value] of Object.entries(exports)) {
    assert(
      typeof value === 'function',
      'browser bundle omitted export ' + subpath + ':' + name,
    );
  }
}
(globalThis as typeof globalThis & {
  __vercelErrorExercisedExports?: Record<string, string[]>;
}).__vercelErrorExercisedExports = Object.fromEntries(
  Object.entries(runtimeExports).map(([subpath, exports]) => [
    subpath,
    Object.keys(exports).sort(),
  ]),
);

assert(
  isError(new Error('browser failure')),
  'isError did not recognize an Error created in the Node VM',
);
const acceptsTagForgery = (
  globalThis as typeof globalThis & {
    __vercelErrorAcceptsTagForgery: boolean;
  }
).__vercelErrorAcceptsTagForgery;
assert(
  isError({ [Symbol.toStringTag]: 'Error' }) === acceptsTagForgery,
  'isError did not select the expected recognition branch',
);

let plainErrorRejected = false;
try {
  errorResponse(new Error('Secret browser failure'));
} catch (caught) {
  plainErrorRejected = caught instanceof TypeError;
}
assert(
  plainErrorRejected,
  'errorResponse did not reject a plain Error with TypeError',
);

const developerCanaries = [
  'DEV_MESSAGE',
  'DEV_NAME',
  'DEV_REASON',
  'DEV_HINT',
  'DEV_FIX',
  'DEV_LINK',
  'DEV_REQUEST_ID',
  'DEV_METADATA',
  'DEV_ATTRIBUTE',
  'DEV_CAUSE',
];
function assertNoDeveloperCanaries(body: string, formatName: string): void {
  for (const canary of developerCanaries) {
    assert(!body.includes(canary), formatName + ' body contains ' + canary);
  }
}

const cause = new Error('DEV_CAUSE');
const errors = createErrors({ scope: 'browser' });
const error = errors.create('DEV_MESSAGE', {
  attributes: { diagnostic: 'DEV_ATTRIBUTE' },
  cause,
  code: 'unavailable',
  fix: 'DEV_FIX',
  hint: 'DEV_HINT',
  link: 'https://example.com/DEV_LINK',
  metadata: { diagnostic: 'DEV_METADATA' },
  public: { message: 'The service is unavailable' },
  reason: 'DEV_REASON',
  requestId: 'DEV_REQUEST_ID',
  statusCode: 503,
});
error.name = 'DEV_NAME';

assert(error instanceof VercelError, 'createErrors did not use VercelError');
assert(hasCode(error, 'unavailable'), 'hasCode did not match the error code');
assert(isErrorLike(error), 'isErrorLike did not recognize VercelError');
assert(isVercelError(error), 'isVercelError did not recognize VercelError');
assert(getMessage(error) === 'DEV_MESSAGE', 'getMessage changed the message');
assert(getRootCause(error) === cause, 'getRootCause did not return the cause');

const json = errorResponse(error);
assert(
  json.status === 503,
  'errorResponse did not map statusCode 503 to response status 503',
);
assert(
  json.headers['Content-Type'] === 'application/json',
  'JSON response content type was not application/json',
);
assertNoDeveloperCanaries(json.body, 'JSON');
const jsonData = JSON.parse(json.body);
assert(
  Object.keys(jsonData).join(',') === 'error',
  'JSON response contains unexpected top-level fields',
);
assert(
  Object.keys(jsonData.error).sort().join(',') === 'code,message,scope',
  'JSON response contains unexpected error fields',
);
assert(
  jsonData.error.scope === 'browser' &&
    jsonData.error.code === 'unavailable' &&
    jsonData.error.message === 'The service is unavailable',
  'JSON response fields do not match the public error',
);

const parsed = parseErrorResponse(jsonData);
assert(
  parsed?.error.message === 'The service is unavailable',
  'parseErrorResponse did not return the public message',
);
const reconstructed = fromErrorResponse(parsed, { statusCode: json.status });
assert(
  reconstructed.message === 'The service is unavailable' &&
    reconstructed.scope === 'browser' &&
    reconstructed.code === 'unavailable' &&
    reconstructed.statusCode === 503 &&
    reconstructed.public?.message === 'The service is unavailable',
  'fromErrorResponse did not reconstruct the public response fields',
);
assert(
  errorResponse(reconstructed).body === json.body,
  'reconstructed error did not serialize to the same public body',
);

const ansiHeaders = {
  get(name: string): string | null {
    return name === 'x-error-format' ? 'ansi' : null;
  },
};
assert(
  wantsAnsi(ansiHeaders),
  'wantsAnsi did not accept x-error-format: ansi',
);
const ansi = errorResponse(error, { request: ansiHeaders });
assert(
  ansi.headers['Content-Type'] === 'text/plain; charset=utf-8',
  'ANSI response content type was not text/plain; charset=utf-8',
);
assert(
  ansi.body.includes('\x1b['),
  'errorResponse did not emit ANSI control sequences',
);
assert(
  ansi.body.includes('The service is unavailable'),
  'ANSI response body omitted the public message',
);
assertNoDeveloperCanaries(ansi.body, 'ANSI');

assert(
  formatError(reconstructed, { format: 'plain' }).includes(
    'The service is unavailable',
  ),
  'plain format omitted the reconstructed public message',
);
const renderedFrame = frame(
  'Browser failure',
  [hint('Try again'), fix('Retry'), link('https://example.com/help')],
  { format: 'tree' },
);
assert(
  renderedFrame.includes('hint: Try again') &&
    renderedFrame.includes('fix: Retry') &&
    renderedFrame.includes('read more: https://example.com/help'),
  'tree frame omitted a structured section',
);

(globalThis as typeof globalThis & {
  __vercelErrorBrowserCheckComplete?: boolean;
}).__vercelErrorBrowserCheckComplete = true;
`;

await main();
