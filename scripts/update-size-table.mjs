import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readmePath = resolve(root, 'README.md');
const configPath = resolve(root, '.size-limit.json');
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error('Run this script through pnpm size:readme');
}

const startMarker = '<!-- SIZE-TABLE:START -->';
const endMarker = '<!-- SIZE-TABLE:END -->';

const groupByPath = {
  'dist/index.js': '@vercel/error',
  'dist/client.js': '@vercel/error/client',
  'dist/server.js': '@vercel/error/server',
  'dist/format.js': '@vercel/error/format',
};

function runPnpm(args, options = {}) {
  return execFileSync(process.execPath, [pnpmCli, ...args], {
    cwd: root,
    ...options,
  });
}

function formatBytes(bytes) {
  if (bytes < 1000) return `${bytes} B`;

  const kilobytes = bytes / 1000;
  const formatted =
    kilobytes % 1 === 0
      ? kilobytes.toFixed(0)
      : kilobytes.toFixed(2).replace(/0$/, '');
  return `${formatted} kB`;
}

function buildTable(entries, config) {
  const configByName = new Map(config.map((entry) => [entry.name, entry]));
  const groups = new Map();

  for (const entry of entries) {
    const configured = configByName.get(entry.name);
    const group = groupByPath[configured?.path] ?? 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(entry);
  }

  const rows = [
    '| Entry point or export | Size (min+brotli) |',
    '| --- | ---: |',
  ];
  for (const label of [
    '@vercel/error',
    '@vercel/error/client',
    '@vercel/error/server',
    '@vercel/error/format',
    'Other',
  ]) {
    const items = groups.get(label);
    if (!items) continue;

    rows.push(`| **${label}** | |`);
    for (const entry of items) {
      rows.push(`| \`${entry.name}\` | ${formatBytes(entry.size)} |`);
    }
  }

  return rows.join('\n');
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));
runPnpm(['build'], { stdio: 'inherit' });
execFileSync(
  process.execPath,
  [resolve(root, 'scripts/verify-size-coverage.mjs')],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
const output = runPnpm(['exec', 'size-limit', '--json'], {
  encoding: 'utf8',
});
const table = buildTable(JSON.parse(output), config);

const readme = readFileSync(readmePath, 'utf8');
const startIndex = readme.indexOf(startMarker);
const endIndex = readme.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  throw new Error(
    'README.md must contain SIZE-TABLE:START before SIZE-TABLE:END',
  );
}

const updated = `${readme.slice(0, startIndex + startMarker.length)}
${table}
${readme.slice(endIndex)}`;

writeFileSync(readmePath, updated);
runPnpm(['exec', 'oxfmt', 'README.md'], {
  stdio: 'inherit',
});
console.log('README.md size table updated.');
