# @vercel/error

## 0.1.0

### Minor Changes

- Separate developer diagnostics from client-approved `public` details, require a nonblank public message, preserve optional `scope` and `code`, and reject malformed known wire fields.
- Add deterministic `auto`, `plain`, `tree`, and `ansi` rendering with structured sections and multiline containment.
- Add synchronous `onReport` and `onSerialize` diagnostics callbacks with explicit failure propagation.
- Standardize authored `statusCode`, concrete `status`, cross-realm data recognition, and packed-package release verification.

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
