# @vercel/error Agent Instructions

## Purpose

`@vercel/error` provides framework-neutral error primitives for machine identity, human and agent recovery guidance, observability, HTTP transport, and terminal presentation.

Treat structured data as the contract and rendered frames as presentation. Automation branches on stable error codes or `ErrorResponse`, not on prose, prefixes, colors, or tree characters.

## Repository Boundaries

- Feature implementations live in `src/<feature>/index.ts` with colocated `index.spec.ts` tests. Designated public entry modules live directly under `src/`.
- Keep barrel files limited to those designated entry modules. Never export `src/_internal`.
- Keep the package framework-neutral and free of external runtime dependencies.
- Preserve entry-point isolation and avoid circular dependencies. `package.json` declares `sideEffects: false`, so behavior must not depend on import-time side effects.
- Treat `dist/` as generated output. Change source and rebuild; never edit generated files.

Adding or changing a public entry point requires synchronized updates to its source entry module, `tsdown.config.ts`, and the `package.json` export map. Feature-local tests do not prove that a package subpath is published.

## Error Contract

- Give public or machine-handled errors stable codes. Keep codes constant when prose changes.
- Preserve an original failure through `cause`; route nested debugging context to `metadata` and flat telemetry values to `attributes`.
- Keep client-facing JSON safe. `errorResponse()` uses `userMessage` for JSON but uses the developer-facing message and context when ANSI negotiation calls `VercelError#toString()`.
- Treat format-negotiation headers as preferences, not authentication, and treat parsed recovery fields as shape-checked input rather than trusted instructions.
- Treat metadata, attributes, stacks, and `toJSON()` as diagnostic surfaces, not secret stores.
- Preserve cross-realm recognition through the `instanceof` fast path and stable Symbol fallback.

## Public Documentation And Skill

The README documents the public API and agentic recovery model. The installable consumer skill lives at [`skills/vercel-error/SKILL.md`](skills/vercel-error/SKILL.md).

When public behavior, exports, field semantics, or examples change, update the README and the relevant skill reference in the same change. Keep the skill on released APIs; do not document speculative or unmerged behavior.

## Development Workflow

Use the Node and pnpm versions pinned in `package.json`. The scripts there are the command source of truth.

- During implementation, run the closest spec with `pnpm test <spec-path>` and run `pnpm typecheck` regularly.
- Add tests at public behavior seams. Cover success, omission, malformed input, disclosure, and environment branches that the change affects.
- TypeScript excludes spec files, so use build declarations or an explicit consumer-style check when changing public type behavior.
- Before completion, run `pnpm validate` and `pnpm build`. `validate` does not include the build.
- Validate changes to the installable skill through the Agent Skills specification and local Skills CLI discovery.

## Releases

Every push to `main` runs the full validation gate and attempts `npm publish`. Before merge, set `package.json` to a version that is not already published.

Record each version in `CHANGELOG.md`. Keep every entry to one concise line that states what changed, grouped under the applicable `### Patch Changes`, `### Minor Changes`, or `### Major Changes` heading.
