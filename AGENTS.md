# @vercel/error Agent Instructions

## Purpose

`@vercel/error` gives errors stable codes, recovery fields, diagnostic context, HTTP serialization, and terminal formatting without depending on a framework.

Software should branch on stable error codes or `ErrorResponse`. Frames and prose are for reading, not parsing.

## Repository Boundaries

- Feature implementations live in `src/<feature>/index.ts` with colocated `index.spec.ts` tests. Designated public entry modules live directly under `src/`.
- Keep barrel files limited to those designated entry modules. Never export `src/_internal`.
- Keep the package framework-neutral and free of external runtime dependencies.
- Keep public entry points independent and avoid circular dependencies. `package.json` declares `sideEffects: false`, so behavior must not depend on code that runs during import.
- Treat `dist/` as generated output. Change source and rebuild; never edit generated files.

When adding or changing a public entry point, update its source module, `tsdown.config.ts`, and the `package.json` export map together. A feature-local test does not prove that the package publishes the subpath.

## Error Contract

- Give public or machine-handled errors stable codes. Keep codes constant when prose changes.
- Preserve an original failure through `cause`; route nested debugging context to `metadata` and flat telemetry values to `attributes`.
- Keep client-facing JSON safe. `errorResponse()` uses `userMessage` for JSON but uses the developer-facing message and context when ANSI negotiation calls `VercelError#toString()`.
- Headers that request ANSI output choose a format; they do not authenticate the caller.
- `parseErrorResponse()` checks field types, not who sent the response. Do not treat parsed fixes or links as authorized actions.
- `metadata`, `attributes`, stacks, and `toJSON()` output may be logged or serialized. Never put secrets in them.
- Preserve cross-realm recognition through the `instanceof` fast path and stable Symbol fallback.

## Public Documentation And Skill

The README documents the public API and how coding agents should use its structured fields. The installable skill lives at [`skills/vercel-error/SKILL.md`](skills/vercel-error/SKILL.md).

When public behavior, exports, field semantics, or examples change, update the README and every skill reference that states the changed contract. Keep the skill on released APIs; do not document speculative or unmerged behavior.

## Development Workflow

Use `package.json` for Node and pnpm requirements and the package's existing scripts.

- Run the closest spec after behavior changes. For public type changes, run `pnpm typecheck` and inspect built declarations or run an explicit consumer-style check because specs are excluded from TypeScript.
- Test observable behavior through the public API. Cover the success, omitted-value, malformed-input, disclosure, and environment cases affected by the change.
- Before completion, run `pnpm validate` and `pnpm build`. `validate` does not include the build.
- For skill changes, require `npx skills add . --list` to list `vercel-error` and verify that every relative link resolves.

## Releases

Every push to `main` runs the full validation gate and attempts `npm publish`. Before merge, set `package.json` to a version that is not already published.

Record each version in `CHANGELOG.md`. Keep every entry to one concise line that states what changed, grouped under the applicable `### Patch Changes`, `### Minor Changes`, or `### Major Changes` heading.
