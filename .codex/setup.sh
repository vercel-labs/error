#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)"
  fnm use --install-if-missing
fi

node --eval '
  if (Number(process.versions.node.split(".")[0]) < 24) {
    console.error("Error setup requires Node.js 24 or newer (see package.json).");
    process.exit(1);
  }
'

corepack pnpm install --frozen-lockfile
corepack pnpm build
