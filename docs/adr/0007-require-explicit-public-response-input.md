# Require explicit public response input

## Context

Flat `ErrorResponseInput` and `VercelErrorLike` both used a top-level `message`. Structured clone and JSON drop symbol-keyed tags, so a developer message could be treated as approved flat response input after transfer.

## Decision

Require untagged `ErrorResponseInput` to put approved prose under `public`. Tagged `VercelErrorLike` values continue to use nested `public` or the generic fallback. Use `ErrorResponseData` as the client-safe serialization shape. Symbol-based recognition applies only while the tag remains observable, and diagnostic contents remain unknown until validated.

## Reason

Without the tag, no validator can distinguish a developer `{ message }` from the former flat public input. Nested `public` keeps the disclosure decision explicit after serialization.

## Consequences

The 0.2 interface removes flat response prose. Callers must move approved fields under `public`. Applications that need full diagnostics across worker or serialization channels must define a separate transport.
