# Require explicit public response input

## Context

Flat `ErrorResponseInput` and `VercelErrorLike` both used a top-level `message`. Structured clone and JSON remove symbol-keyed tags, so minimal tagged error data could return as untagged flat input and expose its developer message.

## Decision

Require untagged `ErrorResponseInput` to put approved prose under `public`. Tagged `VercelErrorLike` values continue to use nested `public` or the generic fallback. Treat `ErrorResponseData` as the client-safe serialization shape; symbol-based recognition applies only while the tag remains observable, and recognized diagnostic contents remain unknown until validated.

## Reason

After a tag is lost, no validator can distinguish a developer `{ message }` from the former flat public input. Nested `public` records the disclosure decision and remains safe after serialization.

## Consequences

The 0.2 interface removes flat response prose. Callers must move approved fields under `public`. Applications that need full diagnostics across worker or serialization channels must define a separate transport.
