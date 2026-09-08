---
status: accepted
---

# Separate response data from the HTTP response

JSON and ANSI bodies must be built from the same normalized error identity and public-details projection, while concrete HTTP status, headers, body format, and serialization diagnostics apply only when producing a response. The `error-response-data` module therefore owns `ErrorResponseData` and its projection, parsing, and reconstruction, while the HTTP adapter owns `ErrorResponseInput`, the concrete `ErrorResponse`, status validation, body-format negotiation and serialization, headers, and `onSerialize` ordering. This adds explicit role names and a module seam instead of one response type that mixes normalized data with transport state, keeping projection rules separate from body formatting and transport policy.
