# Normalize response identity and public details

## Context

Software branches on `scope` and `code`, but blank values cannot identify an error. Before this change, JSON could include blank public details that terminal output omitted.

## Decision

- A defined `scope` or `code` must be a nonblank string. Check trimmed length but keep the original text.
- `VercelError` and response building reject blank identity with `TypeError`. Parsing rejects it by returning `undefined`.
- Blank optional public `reason`, `hint`, `fix`, and `link` values are omitted. Nonblank text is preserved exactly.
- Recognition guards keep their shape checks. Factories add no separate validation. Reconstruction takes validated `ErrorResponseData`.

## Reason

Blank identity cannot support reliable branching. Omitting blank details keeps JSON and ANSI data consistent without adding separate checks to factories or reconstruction.
