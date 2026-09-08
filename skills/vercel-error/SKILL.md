---
name: vercel-error
description: Use @vercel/error to design, implement, migrate, audit, or review structured TypeScript errors. Trigger when a project uses or adopts the package, or when work involves its codes, fields, factories, HTTP APIs, telemetry, or terminal output. Use native Error for local failures that need no stable identity, recovery guidance, observability, or transport.
license: MIT
---

# @vercel/error

Use structured fields to identify what failed, explain why, and suggest what to do next. Software should branch on stable fields; people and agents should read the prose. Preserve the fields until output is rendered, and never parse terminal formatting.

## Workflow

### 1. Inspect the target project

Read the target project's `package.json`, lockfile, existing errors, output paths, logging, and tests before choosing an API.

- Use the installed `@vercel/error` version's public exports as the contract. Do not deep-import unexported source paths.
- If the package is absent, resolve the intended version from workspace constraints or the current release, then inspect its published exports and `engines`. Add it as a production dependency only for requested implementation work.
- Compare a Node target's version with the selected version's `engines`, and report an incompatibility instead of silently changing the runtime. The package itself is isomorphic (browsers, workers, edge runtimes), so treat `engines` as the Node support matrix, not a runtime allowlist.
- Record the project's existing code and scope names and the callers that depend on them. In step 4, preserve or challenge those conventions based on evidence.
- Leave dependencies unchanged for advice and review.

Before continuing, record the selected version and runtime compatibility, verify the public imports, and identify where the error is created, handled, sent, logged, or shown.

### 2. Decide whether a structured error is needed

Keep native `Error` for a simple local failure that no caller classifies, transports, reports, or presents with recovery guidance. Use `@vercel/error` when at least one of these is needed:

- a stable code or scope
- structured reason, hint, fix, or documentation
- HTTP transport and reconstruction
- telemetry or debugging context
- consistent terminal presentation
- reliable recognition across bundle or realm boundaries

Use a structured error only when you can name the caller, transport, logger, or UI that needs it. "It is more consistent" is not enough.

### 3. Choose the public API

| Need                                                                                                                 | Public API                                                 | Read                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Add, change, or audit identity, developer context, the client-visible `public` projection, transport, or diagnostics | `VercelErrorOptions`                                       | [Contract design](references/contract-design.md)        |
| Construct one error, define a subclass, preserve a cause, or inspect a caught value                                  | `VercelError`, core guards and extractors                  | [Core errors](references/core.md)                       |
| Create a typed error family with shared scope, diagnostics, documentation, reporting, or a custom class              | `createErrors`                                             | [`createErrors` factories](references/create-errors.md) |
| Produce or consume HTTP error responses                                                                              | `errorResponse`, `parseErrorResponse`, `fromErrorResponse` | [HTTP errors](references/http.md)                       |
| Format an error you do not own for people and agents                                                                 | `formatError`, `frame`, `hint`, `fix`, `link`              | [Terminal output](references/format.md)                 |

Use `VercelError#toString()` for a `VercelError`; it already uses the package formatter. Use `frame()` for errors or CLI output that should remain another type.

Read each reference whose row matches the work. Continue when every required operation maps to a public import verified in the selected package version.

### 4. Choose fields and recovery guidance

Apply [Contract design](references/contract-design.md) to every field in scope, including its [pushback rules](references/contract-design.md#when-to-push-back).

Before implementation, verify that every populated field has a known use and every client-visible field is safe.

### 5. Implement or review

For review work, report correctness, disclosure, and recovery gaps; edit only when asked.

For implementation, change only the error path that needs structured fields. Preserve surrounding behavior, code conventions, and third-party error types. Treat project-wide code or scope renames as a separate migration. Code examples must typecheck in the shown context or be labeled as partial replacements.

This step is complete when the reviewed or changed scope is limited to the identified use and every example is complete or explicitly partial.

### 6. Test public behavior

Test the behavior that consumes the error, not private formatting helpers:

- creation, throwing, and reporting through the factory when those paths matter
- stable code and preserved cause for programmatic handling
- client-safe JSON and ANSI text parity, plus the returned HTTP status
- rejection of invalid unknown response data before reconstruction
- terminal output with and without optional sections
- the actual public package entry point used by the target project

Run the target project's closest test and typecheck first, then its required checks. Verification is complete when they pass or every failure and untested runtime or integration path is reported.
