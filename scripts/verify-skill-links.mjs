import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../skills/vercel-error',
);
const markdownFiles = collectMarkdownFiles(skillRoot);
const brokenLinks = [];

for (const file of markdownFiles) {
  const markdown = readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const destination = match[1].split('#')[0];
    if (!destination || /^(?:https?:|mailto:)/.test(destination)) continue;

    const target = resolve(dirname(file), decodeURIComponent(destination));
    if (!existsSync(target)) {
      brokenLinks.push(`${file.slice(skillRoot.length + 1)} -> ${match[1]}`);
    }
  }
}

if (brokenLinks.length > 0) {
  throw new Error(`Broken skill links:\n${brokenLinks.join('\n')}`);
}

console.log(
  `Verified ${markdownFiles.length} skill Markdown files and all relative inline link target paths.`,
);

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(path));
    } else if (entry.name.endsWith('.md') && statSync(path).isFile()) {
      files.push(path);
    }
  }
  return files;
}
