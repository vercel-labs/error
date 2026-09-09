import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readmePath = resolve(root, 'README.md');
const configPath = resolve(root, '.size-limit.json');

const startMarker = '<!-- SIZE-TABLE:START -->';
const endMarker = '<!-- SIZE-TABLE:END -->';

const groupByPath = {
  'src/index.ts': 'Root',
  'src/client.ts': 'Client',
  'src/server.ts': 'Server',
  'src/format.ts': 'Format',
};

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

  const rows = ['| Export | Size (min+brotli) |', '| --- | ---: |'];
  for (const label of ['Root', 'Client', 'Server', 'Format', 'Other']) {
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
const output = execFileSync('pnpm', ['exec', 'size-limit', '--json'], {
  cwd: root,
  encoding: 'utf8',
});
const table = buildTable(JSON.parse(output), config);

const readme = readFileSync(readmePath, 'utf8');
const startIndex = readme.indexOf(startMarker);
const endIndex = readme.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  throw new Error('Missing or invalid SIZE-TABLE markers in README.md');
}

const updated = `${readme.slice(0, startIndex + startMarker.length)}
${table}
${readme.slice(endIndex)}`;

writeFileSync(readmePath, updated);
execFileSync('pnpm', ['exec', 'oxfmt', readmePath], {
  cwd: root,
  stdio: 'inherit',
});
console.log('README.md size table updated.');
