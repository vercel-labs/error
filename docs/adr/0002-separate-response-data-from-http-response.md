# Separate response data from the HTTP response

## Context

JSON and ANSI bodies must use the same error identity and public details. HTTP status, headers, body format, and serialization diagnostics exist only while producing a response. Parsing and reconstruction operate on the structured error data alone.

## Decision

The `error-response-data` module owns the construction, parsing, and reconstruction of `ErrorResponseData`. The HTTP adapter owns `ErrorResponseInput`, the completed `ErrorResponse`, status validation, body selection and serialization, headers, and `onSerialize` ordering.

Use a different name for each role: `ErrorResponseInput` is flat public input, `ErrorResponseData` is the canonical data shared by all body formats, and `ErrorResponse` is the completed status, body, and headers.

## Reason

Building one canonical data shape keeps JSON and ANSI disclosure rules consistent. Keeping HTTP state out of that shape gives each rule one owner and avoids mixing public fields with response construction.

## Consequences

Client parsing and reconstruction depend only on `ErrorResponseData`. Server serialization adds status and selects a body format without changing the public fields.
