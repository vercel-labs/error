import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
);
const config = JSON.parse(
  readFileSync(resolve(root, '.size-limit.json'), 'utf8'),
);

const publicTargets = new Set();
const problems = [];
const targets = [];
let exportCount = 0;

for (const [subpath, target] of Object.entries(packageJson.exports)) {
  if (typeof target?.default !== 'string') {
    problems.push(`Package export "${subpath}" has no default runtime target`);
    continue;
  }

  const relativeTarget = target.default.replace(/^\.\//, '');
  const absoluteTarget = resolve(root, relativeTarget);
  publicTargets.add(relativeTarget);

  if (!existsSync(absoluteTarget)) {
    problems.push(
      `Package export "${subpath}" is missing built target "${target.default}"`,
    );
    continue;
  }

  targets.push({ subpath, relativeTarget, absoluteTarget });
}

const measuredTargets = await Promise.all(
  targets.map(async (target) => ({
    subpath: target.subpath,
    relativeTarget: target.relativeTarget,
    runtimeExports: Object.keys(
      await import(pathToFileURL(target.absoluteTarget)),
    ),
  })),
);

const budgetedExportsByPath = new Map();
const resultNames = new Set();
for (const entry of config) {
  const resultName =
    typeof entry.name === 'string' && entry.name !== ''
      ? entry.name
      : '<unnamed>';

  if (!publicTargets.has(entry.path)) {
    problems.push(`${resultName} measures non-public path ${entry.path}`);
  }
  if (typeof entry.limit !== 'string' || entry.limit.trim() === '') {
    problems.push(`${resultName} has no size limit`);
  }
  if (resultNames.has(resultName)) {
    problems.push(`Size Limit result name ${resultName} is duplicated`);
  }
  resultNames.add(resultName);

  const importMatch =
    typeof entry.import === 'string'
      ? /^\{\s*([^\s,{}]+)\s*\}$/.exec(entry.import)
      : null;
  if (!importMatch) {
    problems.push(
      `Size Limit config entry ${resultName} must import exactly one runtime export`,
    );
    continue;
  }

  const importedName = importMatch[1];
  if (resultName !== importedName) {
    problems.push(
      `Size Limit result name ${resultName} must match imported export ${importedName}`,
    );
  }

  if (!budgetedExportsByPath.has(entry.path)) {
    budgetedExportsByPath.set(entry.path, []);
  }
  budgetedExportsByPath.get(entry.path).push(importedName);
}

for (const { subpath, relativeTarget, runtimeExports } of measuredTargets) {
  const budgetedExports = budgetedExportsByPath.get(relativeTarget) ?? [];

  exportCount += runtimeExports.length;
  for (const name of runtimeExports) {
    const matches = budgetedExports.filter((candidate) => candidate === name);
    if (matches.length !== 1) {
      problems.push(
        `Runtime export "${name}" from package export "${subpath}" has ${matches.length} size budget entries`,
      );
    }
  }
  for (const name of budgetedExports) {
    if (!runtimeExports.includes(name)) {
      problems.push(
        `Size Limit config for package export "${subpath}" defines a budget for unknown runtime export "${name}"`,
      );
    }
  }
}

if (problems.length > 0) {
  throw new Error(`Invalid size budget coverage:\n${problems.join('\n')}`);
}

console.log(`Verified size budgets for ${exportCount} public runtime exports.`);
