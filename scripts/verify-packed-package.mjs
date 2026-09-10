import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
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
const fixtureDirectory = join(packageRoot, 'scripts/fixtures/packed-consumer');
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
    const installedPackageRoot = join(
      consumerDirectory,
      'node_modules/@vercel/error',
    );
    verifyPackedMetadata(installedPackageRoot);
    verifyPackedManifest(installedPackageRoot);

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
    for (const fixture of [
      'browser.ts',
      'consumer.ts',
      'tsconfig.browser.json',
      'tsdown.browser.config.mjs',
      'utility.ts',
    ]) {
      copyFileSync(
        join(fixtureDirectory, fixture),
        join(consumerDirectory, fixture),
      );
    }

    const tsc = join(packageRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    execFileSync(process.execPath, [tsc, '--project', 'tsconfig.json'], {
      cwd: consumerDirectory,
      stdio: 'inherit',
    });
    execFileSync(
      process.execPath,
      [tsc, '--project', 'tsconfig.browser.json'],
      {
        cwd: consumerDirectory,
        stdio: 'inherit',
        timeout: 60_000,
      },
    );

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

function verifyPackedMetadata(installedPackageRoot) {
  const installedPackage = JSON.parse(
    readFileSync(join(installedPackageRoot, 'package.json'), 'utf8'),
  );
  const expectations = [
    ['name', installedPackage.name, '@vercel/error'],
    ['license', installedPackage.license, 'MIT'],
    [
      'repository.url',
      installedPackage.repository?.url,
      'git+https://github.com/vercel-labs/error.git',
    ],
    ['publishConfig.access', installedPackage.publishConfig?.access, 'public'],
    ['type', installedPackage.type, 'module'],
    ['sideEffects', installedPackage.sideEffects, false],
    ['engines.node', installedPackage.engines?.node, '>=24'],
  ];

  for (const [field, actual, expected] of expectations) {
    if (actual !== expected) {
      throw new Error(
        `Packed package ${field} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
      );
    }
  }

  if (
    typeof installedPackage.exports !== 'object' ||
    installedPackage.exports === null
  ) {
    throw new Error('Packed package exports must be an object');
  }
  for (const [subpath, target] of Object.entries(installedPackage.exports)) {
    if (typeof target !== 'object' || target === null) {
      throw new Error(`Packed export ${subpath} must use conditional exports`);
    }
    const conditions = Object.keys(target);
    const typesIndex = conditions.indexOf('types');
    const defaultIndex = conditions.indexOf('default');
    if (typesIndex === -1 || defaultIndex === -1 || typesIndex > defaultIndex) {
      throw new Error(
        `Packed export ${subpath} must declare types before default`,
      );
    }
  }
}

function verifyPackedManifest(installedPackageRoot) {
  const files = listPackedFiles(installedPackageRoot);
  const requiredRootFiles = ['LICENSE', 'README.md', 'package.json'];
  for (const required of requiredRootFiles) {
    if (!files.includes(required)) {
      throw new Error(`Packed package is missing ${required}`);
    }
  }

  for (const file of files) {
    if (file.split('/').some((segment) => segment.startsWith('.'))) {
      throw new Error(`Packed package contains hidden path ${file}`);
    }
    if (requiredRootFiles.includes(file)) continue;
    if (!file.startsWith('dist/')) {
      throw new Error(`Packed package contains unexpected file ${file}`);
    }
    if (file.slice('dist/'.length).includes('/')) {
      throw new Error(`Packed package contains nested artifact ${file}`);
    }
  }

  const remainingArtifacts = new Set(
    files.filter((file) => file.startsWith('dist/')),
  );
  for (const required of [
    'dist/client.d.ts',
    'dist/client.js',
    'dist/format.d.ts',
    'dist/format.d.ts.map',
    'dist/format.js',
    'dist/index.d.ts',
    'dist/index.d.ts.map',
    'dist/index.js',
    'dist/index.js.map',
    'dist/server.d.ts',
    'dist/server.d.ts.map',
    'dist/server.js',
    'dist/server.js.map',
  ]) {
    if (!remainingArtifacts.delete(required)) {
      throw new Error(`Packed package is missing artifact ${required}`);
    }
  }

  for (const family of ['error-response-data', 'format', 'is-vercel-error']) {
    consumeChunkFamily(remainingArtifacts, family, ['.js', '.js.map']);
  }
  for (const family of ['index', 'types']) {
    consumeChunkFamily(remainingArtifacts, family, ['.d.ts', '.d.ts.map']);
  }

  if (remainingArtifacts.size > 0) {
    throw new Error(
      `Packed package contains unexpected artifacts: ${[...remainingArtifacts].toSorted().join(', ')}`,
    );
  }
}

function consumeChunkFamily(files, family, suffixes) {
  const prefix = `dist/${family}-`;
  const matches = [];
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const suffix = suffixes.find((candidate) => file.endsWith(candidate));
    if (!suffix) continue;
    matches.push({
      file,
      hash: file.slice(prefix.length, -suffix.length),
      suffix,
    });
  }

  if (
    matches.length !== suffixes.length ||
    new Set(matches.map((match) => match.hash)).size !== 1 ||
    new Set(matches.map((match) => match.suffix)).size !== suffixes.length ||
    matches.some((match) => match.hash === '')
  ) {
    throw new Error(
      `Packed package must contain one ${family} chunk with ${suffixes.join(' and ')}`,
    );
  }

  for (const match of matches) {
    files.delete(match.file);
  }
}

function listPackedFiles(directory, relativeDirectory = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`Packed package contains symbolic link ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...listPackedFiles(join(directory, entry.name), relativePath));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `Packed package contains unsupported entry ${relativePath}`,
      );
    }
    files.push(relativePath);
  }
  return files.toSorted();
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
      Object.entries(installedPackage.exports)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(async ([subpath, target]) => [
          subpath,
          Object.keys(
            await import(
              pathToFileURL(resolve(installedPackageRoot, target.default))
            ),
          ),
        ]),
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
      JSON.stringify(sandbox.__vercelErrorRuntimeExportKeys) !==
      expectedRuntimeExportsJson
    ) {
      throw new Error(
        `Browser-platform bundle runtime export keys do not match the installed package in Node VM scenario "${scenario.name}"`,
      );
    }
  }
}

await main();
