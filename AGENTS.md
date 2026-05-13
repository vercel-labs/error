# @vercel/error — Agent Instructions

## Repository Overview

This is the `@vercel/error` package — unified error primitives for Vercel, designed for humans and agents.

Tech stack: TypeScript 6+, tsdown (bundler), vitest (tests), oxlint (linting), oxfmt (formatting), lefthook (pre-commit hooks), changesets (versioning).

## Essential Commands

```bash
pnpm build             # Build (tsdown)
pnpm test              # Run tests (vitest)
pnpm typecheck         # Type check (tsc --noEmit)
pnpm lint              # Lint (oxlint)
pnpm lint:fix          # Lint and auto-fix (oxlint --fix)
pnpm format            # Check formatting (oxfmt --check)
pnpm format:fix        # Fix formatting (oxfmt)
pnpm validate          # Run typecheck, lint, format, and test in parallel
```

## Architecture

Flat layout — every function is one folder at `src/` root with co-located tests:

```
src/<fn-name>/index.ts       # Implementation
src/<fn-name>/index.spec.ts  # Tests
```

### Entry Points

| Export     | Source          | Contents                                             |
| ---------- | --------------- | ---------------------------------------------------- |
| `.`        | `src/index.ts`  | VercelError, createErrors, guards, extractors, types |
| `./client` | `src/client.ts` | parseErrorResponse                                   |
| `./server` | `src/server.ts` | toErrorResponse, wantsAnsi                           |
| `./format` | `src/format.ts` | frame, fix, link, setDefaultFormatter                |

### Core Concepts

- **VercelError** — The base error class. Closed (no `[key: string]: unknown`). Has `code`, `scope`, `statusCode?`, `reason?`, `fix?`, `link?`, `userMessage?`, `requestId?`, `metadata?`, `attributes?`. `toString()` auto-detects ANSI.
- **ErrorResponse** — The canonical wire format: `{ error: { code, message, reason?, fix?, link? } }`. Used by all Vercel HTTP error responses.
- **createErrors** — Factory for scoped error namespaces. Returns `{ create }` or `{ create, raise, report }` depending on whether `report` is provided.
- **Cross-realm detection** — Uses `Symbol.for('__vercel_error')` instead of `instanceof` for reliable checks across bundle boundaries.

## Key Design Rules

1. **No barrel files** except the designated entry points.
2. **`_internal/` is never exported** publicly.
3. **Framework-agnostic**: should work with any HTTP framework
4. **No external runtime dependencies**. Do not install any third party runtime dependencies in this package
5. **Avoid circular dependencies**: Never introduce circular dependencies
