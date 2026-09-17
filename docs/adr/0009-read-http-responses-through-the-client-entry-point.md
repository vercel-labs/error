# Read HTTP responses through the client entry point

## Context

Consuming the package's JSON envelope requires the same status, content type, body, validation, reconstruction, and request-context logic at every fetch call. The existing adapter decision assigns all integrations to applications, even when the integration uses only the standard Web `Response` interface and package-owned response rules.

## Decision

Export `fromHttpResponse` from the client entry point. It accepts only 400 through 599 responses with an `application/json` content type, consumes and validates the body, derives status from the response, and reconstructs a `VercelError`. An explicit request ID wins; otherwise, the function reads `x-vercel-id` by default, accepts a custom header name, and allows header lookup to be disabled.

Keep fallback creation, reporting, producer trust, and recovery authority in the application. Keep framework, reporter, and exporter adapters outside this package. Rename the data-level functions to `parseErrorResponseData` and `fromErrorResponseData` so each name identifies its input.

## Reason

The reader centralizes package-specific protocol logic without a runtime dependency or framework contract. The smaller interface removes repeated parsing code while leaving application policy at the call site. Distinct names keep a native HTTP response, canonical response data, and the completed server response separate.

## Consequences

The 0.2 client interface replaces the previous data-level function names. Candidate JSON bodies are consumed even when parsing fails. Browser code can read `x-vercel-id` across origins only when the server exposes it through CORS. The value remains routing context and does not become an application trace ID.
