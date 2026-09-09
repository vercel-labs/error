# @vercel/error Agent Instructions

## Purpose

`@vercel/error` gives errors stable codes, recovery fields, diagnostic context, client-safe HTTP projection, and terminal formatting without a framework or runtime dependency.

Software branches on stable `scope` and `code` values, including those in `ErrorResponseData`. Frames and prose are for reading, not parsing.

## Source Map

Read [`CONTEXT.md`](CONTEXT.md) before naming or changing error-contract concepts. Read the accepted decisions and format rules in [`docs/adr/`](docs/adr/README.md) before changing disclosure, response seams, module ownership, or cross-realm recognition.

- `src/index.ts`, `client.ts`, `server.ts`, and `format.ts` are the designated public entry modules.
- `src/vercel-error/` owns authored error fields, mutability, the stable tag, Error subclass behavior, and diagnostic `toJSON()`.
- `src/error-response-data/` alone owns normalized response data, public projection, strict parsing, and reconstruction.
- `src/to-error-response/` owns HTTP status validation, headers, and `onSerialize` ordering. `src/wants-ansi/` implements the content negotiation it consumes.
- `src/format/` owns presets, sanitization, physical-line containment, connectors, labels, and color.
- `src/create-errors/` owns factory defaults, merge precedence, documentation links, custom constructors, and `onReport` ordering.
- `src/types.ts` holds the shared contract types (`PublicErrorDetails`, `VercelErrorOptions`, `VercelErrorLike`); any feature may import it type-only.
- Guard and extractor implementations remain in their named feature folders with colocated specs.
- `src/_internal/` is never exported.

Keep feature implementations in `src/<feature>/index.ts` with colocated `index.spec.ts` tests. Keep barrel files limited to the designated entry modules. Do not introduce generic `core/`, `shared/`, `value/`, `transport/`, `ports/`, or `adapters/` directories.

## Package Boundaries

- Keep the package framework-neutral, dependency-free at runtime, side-effect free on import, and compatible with `package.json#sideEffects: false`.
- Keep every module isomorphic: the same code runs in browsers, workers, edge runtimes, and Node. Feature-detect newer builtins with a documented fallback instead of requiring them.
- Keep public entry modules independent. A public entry module never imports another public entry module.
- `vercel-error` never imports response data, the HTTP adapter, the client entry, or the server entry.
- `format` never imports the class, response data, or the HTTP adapter at runtime.
- `error-response-data` never imports a public entry module or the HTTP adapter.
- The HTTP adapter reads symbol-recognized values as data and never invokes their methods.
- Treat `dist/` as generated output. Change source and rebuild.

When a public entry point changes, update its source module, `tsdown.config.ts`, and the `package.json` export map together. Prove the published subpath with the packed-consumer check (`pnpm verify:packed`).

## Error Contract

- Keep stable `scope` and `code` separate from prose. Preserve an original failure through `cause`.
- Put nested debugging context in `metadata` and flat telemetry values in `attributes`. Keep secrets out of both.
- Treat constructor `message`, `reason`, `hint`, `fix`, and `link` as developer-facing.
- Put client-approved prose under `public`, with a required nonblank `public.message`.
- Validate `public` at construction (nonblank string `message`, string-only optional fields), drop unknown fields, and freeze the copy so approved copy cannot change through an input alias.
- `errorResponse()` is the client-safe serializer. It uses only `public` prose or the fixed generic fallback, while preserving public `scope` and `code`.
- Treat scope, code, and status as disclosures. Protected-resource handlers own neutral identity and status mappings.
- Use `statusCode` for authored mappings and `status` only for a concrete response. The HTTP adapter accepts integer error statuses from 400 through 599 and defaults omission to 500.
- Keep request ID, metadata, attributes, cause, stack, developer name, and status out of `ErrorResponseData` and both serialized body formats.
- Treat `toJSON()` as diagnostic serialization. It may contain developer prose, stack, metadata, attributes, and public data.
- Parse known response data fields strictly and ignore unknown fields. Parsing validates shape, not producer trust or action authority.
- Keep cross-realm recognition as `instanceof` plus the namespaced symbol and data-shape validation. The tag is forgeable. Use `instanceof VercelError` when local methods are required.
- Classify the package-namespaced tag before flat public input; any other symbol carries no meaning. Tagged-invalid values throw instead of falling through.
- Keep `create`, `raise`, and `report`. Only `report` invokes `onReport`; `create` and `raise` stay free of reporting side effects.
- Keep `onReport` and `onSerialize` synchronous with `undefined` return types. Synchronous callback exceptions propagate.

## Rendering Contract

- Keep `auto`, `plain`, `tree`, and `ansi` behind `formatError`. Only `auto` reads ambient terminal state.
- Keep `hint`, `fix`, and `link` as structured `FrameSection` values. Renderer behavior comes from the token kind, not a parsed string prefix.
- Sanitize every caller-controlled field, normalize CRLF, remove bare carriage returns, and frame every physical continuation line.
- Preserve tabs, blank lines, and useful multiline text while keeping every continuation line under a library-owned prefix.
- Render negotiated HTTP text from normalized public data with explicit `ansi`; never call a symbol-recognized object's method.

## Public Documentation

The README documents the public interface and disclosure model. The installable skill lives at [`skills/vercel-error/SKILL.md`](skills/vercel-error/SKILL.md).

When public behavior, exports, field semantics, or examples change, update the README and every skill reference that states the changed contract. Keep the skill on released interfaces; do not document unmerged behavior.

## JSDoc Standard

Document every public symbol beside its export using the language's native JSDoc. State the facts a caller needs:

- meaning and audience
- required invariants and constraints
- non-obvious defaults
- observable precedence and ordering
- errors and side effects
- disclosure or trust implications at transport seams
- one concise example when options interact

Keep implementation rationale in repository documentation or commit history rather than public JSDoc.

## Development Workflow

Use the Node and pnpm versions declared in `package.json`.

- Run the closest spec after a behavior change.
- Run `pnpm typecheck` regularly. Specs are excluded from TypeScript, so prove public type changes through built declarations or the packed consumer.
- Test observable behavior through public interfaces. Cover success, omission, malformed input, disclosure, and environment cases affected by the change.
- Run `pnpm validate`, `pnpm build`, and `pnpm verify:packed` before completion.
- For skill changes, run `pnpm verify:skill`; it must list `vercel-error` and verify that every relative inline Markdown link points to an existing path.

## Releases

Every push to `main` validates and attempts npm publication. Before merge, set `package.json` to an unpublished version and ensure release validation runs packed-package and skill checks before publish.

Record each version in `CHANGELOG.md`. Keep each entry to one concise line under the applicable `### Patch Changes`, `### Minor Changes`, or `### Major Changes` heading.
