# Normalize response identity and public details

## Context

Software branches on `scope` and `code`, but empty or whitespace-only values do not identify an error. Blank optional public details can also appear in JSON while terminal formatting omits them, leaving the response formats inconsistent.

## Decision

- A defined `scope` or `code` must be a nonblank string. Validation checks trimmed length and preserves every nonblank value exactly.
- `VercelError` construction throws `TypeError` for blank identity. Response projection applies the same rule to tagged values and explicit input; parsing rejects response data with blank identity.
- Blank optional public `reason`, `hint`, `fix`, and `link` values are omitted. Nonblank text is preserved exactly.
- Recognition guards remain structural. Factories add no identity validation, and reconstruction continues to consume validated `ErrorResponseData`.

## Reason

Stable identity must stay separate from wording. One normalized response shape keeps JSON and ANSI output aligned without adding a second identity contract to factories or reconstruction.
