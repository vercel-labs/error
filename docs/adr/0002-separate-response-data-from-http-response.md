# Separate response data from the HTTP response

## Context

JSON and ANSI bodies need the same normalized error identity and public details. Concrete HTTP status, headers, body format, and serialization diagnostics apply only while producing a response, while parsing and reconstruction operate on structured data.

## Decision

The `error-response-data` module owns `ErrorResponseData` projection, parsing, and reconstruction. The HTTP adapter owns `ErrorResponseInput`, concrete `ErrorResponse`, status validation, body-format negotiation and serialization, headers, and `onSerialize` ordering.

Use distinct role names: `ErrorResponseInput` for flat public input, `ErrorResponseData` for normalized data independent of body format, and `ErrorResponse` for the completed status, serialized body, and headers.

## Reason

One normalized data path keeps JSON and ANSI disclosure rules aligned. Separating transport state from response data gives each invariant one owner and avoids a response type that mixes public fields with HTTP construction policy.

## Consequences

Client parsing and reconstruction depend only on response data. Server serialization adds status and selects a body format without changing the normalized public fields.
