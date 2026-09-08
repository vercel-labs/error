# Serve the Vercel error envelope instead of RFC 9457 problem details

## Context

RFC 9457 defines `application/problem+json`, a generic HTTP error body with URI problem types, per-type `title` copy, occurrence `detail`, and open extension members. Vercel's public REST API has an established envelope, `{ "error": { "code", "message", ... } }`, and this package's `ErrorResponseData` extends that envelope with `scope` and the recovery fields `reason`, `hint`, `fix`, and `link`.

## Decision

`errorResponse()` serves the Vercel envelope as `application/json`, or negotiated ANSI text, and does not emit `application/problem+json`. Identity stays in the `scope` and `code` tokens, `link` carries the documentation URL a problem-type URI would otherwise provide, and the concrete status lives only on the HTTP response, never in the body. If a problem-details representation is ever needed, it is added through Accept negotiation as another body format, leaving this envelope unchanged.

## Reason

RFC 9457 exists to spare APIs from inventing a format and says it is "not to replace existing domain-specific formats"; the Vercel envelope is that existing format, and abandoning it would make this package inconsistent with the platform's published APIs. Mapping this contract into problem details would be standard in name only: `type` demands stable URIs where software here branches on `scope` and `code`, `title` wants per-type constant copy the contract does not carry, and `reason`, `hint`, `fix`, and `link` would all ride as extension members that generic consumers ignore. The validation philosophies also disagree: the RFC requires consumers to ignore mistyped members, while `parseErrorResponse` rejects the whole response, and the RFC's own security considerations warn that an in-body `status` invites disagreement with the response status, which this package already excludes by decision.

## Consequences

Interop with problem-details tooling is a translation the application owns: map `code` together with `link` to `type`, `message` to `detail`, and the remaining fields to extension members. Adding a negotiated `application/problem+json` body later is additive at the `errorResponse()` seam and reverses nothing recorded here.
