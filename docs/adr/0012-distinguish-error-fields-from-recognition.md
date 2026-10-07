# Distinguish error fields from recognition

## Context

`VercelErrorLike` describes structural fields used by formatters and field inspection. Response producers also need to distinguish values carrying the package marker from untagged fields.

## Decision

Keep `VercelErrorLike` structural. Require `RecognizedVercelError` or explicit public input at response producers, using the existing tag and guard.

## Reason

Separate types let callers inspect ordinary error fields without treating them as eligible for response production. Recognition distinguishes producer inputs but does not authenticate a producer or approve disclosure.
