# @vercel/error

## 0.1.4

### Patch Changes

- Keep `getMessage()` within its declared string return contract for stateful inputs, and complete generated API documentation for public fields, guards, factories, response data, and formatting types.

## 0.1.3

### Patch Changes

- Verify the packed package as a browser-platform ES2022 IIFE in isolated VM contexts with and without `Error.isError`.

## 0.1.2

### Patch Changes

- Move bundle-size data after the API documentation and simplify cross-realm recognition guidance.

## 0.1.1

### Patch Changes

- Add per-export bundle-size budgets, generated README measurements, and CI enforcement.

## 0.1.0

### Minor Changes

- Separate developer diagnostics from client-approved `public` details, require a nonblank public message, preserve optional `scope` and `code`, and reject malformed known response fields.
- Add `auto`, `plain`, `tree`, and `ansi` rendering presets with structured sections and multiline containment; only `auto` reads ambient terminal state.
- Add synchronous `onReport` and `onSerialize` diagnostics callbacks with explicit failure propagation.
- Distinguish authored `statusCode` from concrete `status`, standardize cross-realm data recognition, and add packed-package release verification.
- Add readonly types for flat public input (`ErrorResponseInput`), normalized client-facing data (`ErrorResponseData`), and the completed HTTP result (`ErrorResponse`), while keeping `VercelError` diagnostic context mutable.
- Make cross-realm error recognition cycle-safe and explicit JSON format requests authoritative.
- Validate `public` details at construction, serialize each disclosed field from a single validated read, and remove Unicode line separators from framed output.
- Recognize errors with the `Error.isError` brand check where available and a structural fallback elsewhere, keeping the package isomorphic across browsers and Node.
- Publish with a Node `engines` floor (`>=24`) instead of a single-major pin.

## 0.0.4

### Patch Changes

- Add an installable agent skill for designing and implementing errors with `@vercel/error`.

## 0.0.3

### Patch Changes

- Stop running Lefthook when consumers install the package.

## 0.0.2

### Patch Changes

- `createErrors`: `scope` is now optional.
- `createErrors`: add `docsBaseUrl` to derive `link` from `code`.
- Render stripped errors by their `[scope:code]` identifier.
- Annotate every error option and document `code` styles.
- Publish publicly on npm.

## 0.0.1

### Patch Changes

- Initial alpha release
