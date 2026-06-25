# @vercel/error

## 0.0.2

### Patch Changes

- `createErrors`: `scope` is now optional, so the factory works with no arguments.
- `createErrors`: add `docsBaseUrl` to derive each error's `link` from its `code`. The code is appended verbatim; pass a function for custom shaping. An explicit per-error `link` always wins.
- Render a stripped error (empty message) by its `[scope:code]` identifier in both the terminal formatter and the HTTP wire format.
- Annotate every error option and document `code` style guidance (semantic, numeric, or namespaced).
- Publish the package publicly on npm.

## 0.0.1

### Patch Changes

- Initial alpha release
