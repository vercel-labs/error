# Separate developer and public error details

## Context

Developers need technical details to diagnose errors, but clients must not receive those details by accident. A `VercelError` keeps developer and client details separate. Flat `ErrorResponseInput` is different: its caller supplies fields that are already safe to send.

## Decision

Keep developer details separate from a frozen copy of public details. Treat every prose field in flat `ErrorResponseInput` as approved for clients. When a `VercelError` has no public details, use a fixed generic message instead of developer text. Treat error identity and HTTP status as public information too.

## Reason

Explicit public details keep developer text out of serialized responses, regardless of body format. The fixed fallback is safe when no public message exists. Flat input stays concise for callers that already control the response body.

## Consequences

Authors provide separate public text when clients need specific guidance. Text reconstructed from a response remains public, but callers must review it before sending it to a different audience.
