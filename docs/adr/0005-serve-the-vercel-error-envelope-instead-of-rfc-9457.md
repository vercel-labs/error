# Serve the Vercel error envelope instead of RFC 9457 problem details

## Context

RFC 9457 defines `application/problem+json`, with a URI `type`, a stable `title` for that type, occurrence-specific `detail`, and optional extension fields. Vercel's public REST API already uses `{ "error": { "code", "message", ... } }`. This package extends that envelope with `scope`, `reason`, `hint`, `fix`, and `link`.

## Decision

`errorResponse()` returns the Vercel envelope as `application/json`, or as ANSI text when requested. It does not return `application/problem+json`. `scope` and `code` identify the error, `link` points to its documentation, and the HTTP status stays out of the body. Future problem-details support would use `Accept` negotiation as another body format without changing the Vercel envelope.

## Reason

RFC 9457 says problem details are "not to replace existing domain-specific formats." Vercel already has such a format, so replacing it here would make this package inconsistent with Vercel's published APIs.

The two contracts also prevent a direct field-for-field mapping. RFC 9457 uses a stable URI as the primary identifier, while this package uses `scope` and `code`. It expects a stable `title` for each type, which this package does not store. The fields `reason`, `hint`, `fix`, and `link` would be extensions that generic problem-details clients ignore. The RFC tells clients to ignore a member with the wrong type, while `parseErrorResponse` rejects the response. It also warns that a `status` in the body can disagree with the HTTP status, so this package keeps status out of the body.

## Consequences

Applications that need problem-details tooling must translate the response: map `code` and `link` to `type`, map `message` to `detail`, and use extension members for the remaining fields. A future negotiated `application/problem+json` body can be added without changing the existing envelope.
