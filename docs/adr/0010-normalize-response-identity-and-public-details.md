# Normalize response identity and public details

## Context

Software branches on `scope` and `code`, but blank values cannot identify an error. JSON can also include blank public details that terminal output omits.

## Decision

- A defined `scope` or `code` must be a nonblank string. Validation checks trimmed length and preserves every nonblank value exactly.
- `VercelError` construction throws `TypeError` for blank identity. Building a response applies the same rule to tagged values and explicit input. Parsing rejects response data with blank identity.
- Blank optional public `reason`, `hint`, `fix`, and `link` values are omitted. Nonblank text is preserved exactly.
- Recognition guards keep their shape checks. Factories add no identity validation. Reconstruction still takes validated `ErrorResponseData`.

## Reason

Codes and scopes must stay separate from messages. Applying these rules where errors are created, sent, and read keeps JSON and ANSI data consistent without adding checks to factories or reconstruction.
