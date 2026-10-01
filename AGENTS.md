# @vercel/error Agent Instructions

## Purpose

`@vercel/error` gives errors stable codes, recovery advice, developer details, HTTP responses built from approved text, and terminal formatting. It has no framework or runtime dependency.

Software branches on stable `scope` and `code` values, including those in `ErrorResponseData`. Frames and prose are for reading, not parsing.

## Source Map

Read [`CONTEXT.md`](CONTEXT.md) before naming or changing error-contract concepts. Read the accepted decisions and format rules in [`docs/adr/`](docs/adr/README.md) before changing disclosure, response seams, module ownership, or cross-realm recognition.

- `src/index.ts`, `client.ts`, `server.ts`, and `format.ts` are the designated public entry modules.
- `src/vercel-error/` owns authored error fields, mutability, the stable tag, Error subclass behavior, and diagnostic `toJSON()`.
- `src/error-response-data/` alone owns response data, the client-safe copy, strict parsing, and reconstruction.
- `src/to-error-response/` owns server response status validation, headers, and `onSerialize` ordering. `src/wants-ansi/` implements the content negotiation it consumes.
- `src/from-http-response/` owns Web `Response` status and media-type checks, body consumption, and response-header request context.
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
- `vercel-error` never imports response data, either HTTP response module, the client entry, or the server entry.
- `format` never imports the class, response data, or either HTTP response module at runtime.
- `error-response-data` never imports a public entry module or either HTTP response module.
- The server response module reads symbol-recognized values as data and never invokes their methods.
- The client response reader uses only the Web `Response` interface and response-data functions. It never reports an error, invents a fallback, or decides whether to trust response guidance.
- Treat `dist/` as generated output. Change source and rebuild.

When a public entry point changes, update its source module, `tsdown.config.ts`, and the `package.json` export map together. Prove the published subpath with the packed-consumer check (`pnpm verify:packed`).

## Error Contract

- Keep stable `scope` and `code` separate from messages. Either may be omitted; a defined value must be a nonblank string. Use `trim()` only to check blankness. Preserve the original value and keep the original failure in `cause`.
- Put nested debugging context in `metadata` and flat telemetry values in `attributes`. Keep secrets out of both.
- Treat constructor `message`, `reason`, `hint`, `fix`, and `link` as developer-facing.
- Put client-approved prose under `public`, with a required nonblank `public.message`.
- Validate `public` at construction: require a nonblank string `message` and strings for optional fields. Omit blank optional fields, drop unknown fields, and freeze the copy so later input changes cannot alter it. Preserve nonblank text exactly.
- `errorResponse()` builds client-safe output from `public` text or the fixed generic message. It rejects blank `scope` or `code` values when building a response.
- Parsing rejects blank defined response identity and omits blank optional public details. Keep `isVercelError()`, `isVercelErrorLikeData()`, and `hasCode()` as structural guards with their current contracts.
- ANSI selection checks `X-Error-Format` first. Only its exact `ansi` value selects ANSI.
- Otherwise, an exact `text/plain+ansi` range in `Accept` selects ANSI with a positive `q` value and no unsupported media parameters. Duplicate ranges use the highest valid `q`. Ranges with only zero, invalid, or unsupported values select JSON and skip the User-Agent fallback.
- When the exact range is absent, a case-sensitive `curl/` marker selects ANSI. Wildcards do not select ANSI.
- JSON uses `application/json`; ANSI uses `text/plain+ansi; charset=utf-8`. Add `Vary: X-Error-Format, Accept, User-Agent` for either format whenever `errorResponse()` receives `request`; omit it when no request is supplied.
- Treat scope, code, and status as disclosures. Protected-resource handlers own neutral identity and status mappings.
- Use `statusCode` for authored mappings and `status` only for a concrete response. Server response production accepts integer error statuses from 400 through 599 and defaults omission to 500. Client response reading accepts only observed statuses in that range.
- Keep request ID, metadata, attributes, cause, stack, developer name, and status out of `ErrorResponseData` and both serialized body formats.
- `fromHttpResponse()` reads `x-vercel-id` into local `requestId` by default. An explicit request ID wins; callers can select another header or disable lookup. Treat the default as Vercel routing context, not an application trace ID.
- Treat `toJSON()` as diagnostic serialization. It may contain developer prose, stack, metadata, attributes, and public data.
- Parse known response data fields strictly and ignore unknown fields. Parsing validates shape, not producer trust or action authority.
- Name data-level client functions `parseErrorResponseData` and `fromErrorResponseData`; reserve `fromHttpResponse` for native Web response consumption.
- Keep cross-realm recognition as `instanceof` plus the namespaced symbol and data-shape validation. The tag is forgeable. Use `instanceof VercelError` when local methods are required.
- Classify the package-namespaced tag before untagged public input; any other symbol carries no meaning. Tagged-invalid values throw instead of falling through.
- Require untagged `ErrorResponseInput` to put approved prose under `public`. Reject a top-level untagged `message`.
- Treat `VercelErrorLike` metadata and attributes as unknown until validated. Symbol-based recognition applies only while the tag remains observable; serialization channels use `ErrorResponseData`.
- Keep `create`, `raise`, and `report`. Only `report` invokes `onReport`; `create` and `raise` stay free of reporting side effects. Without `onReport`, `report` writes a sanitized terminal frame to `console.error`.
- Keep `onReport` and `onSerialize` synchronous with `undefined` return types. Synchronous callback exceptions propagate.

## Rendering Contract

- Keep `auto`, `plain`, `tree`, and `ansi` behind `formatError`. Only `auto` reads ambient terminal state.
- Keep `hint`, `fix`, and `link` as structured `FrameSection` values. Renderer behavior comes from the token kind, not a parsed string prefix.
- Sanitize every caller-controlled field, normalize CRLF, remove bare carriage returns, and frame every physical continuation line.
- Preserve tabs, blank lines, and useful multiline text while keeping every continuation line under a library-owned prefix.
- Render HTTP text from client-safe response data with explicit `ansi`; never call a method on a value recognized only by its symbol tag.

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
