# Structured Error Contract

`@vercel/error` gives errors stable identity and keeps developer details separate from text sent to clients. It covers error recognition across packages and realms, response data, HTTP, diagnostics, and terminal output.

## Language

### Error Model

**Error identity**:
The stable `scope` and `code` values that software uses to classify an error. Either may be absent; a defined value must be nonblank. Identity stays the same when explanatory text changes.
_Avoid_: Error type

**Developer error details**:
Technical text intended for developers and operators diagnosing a failure. The details can state what failed, explain why, and provide recovery guidance or internal documentation.
_Avoid_: Internal error details

**Public error details**:
Text approved for the intended recipient of an error response. It needs a nonblank `message`. Approval to show text does not verify who sent it or authorize an action.
_Avoid_: User message

**Recovery guidance**:
The optional hint, fix, and documentation link that help a reader investigate or recover. Guidance may include concrete steps, but it never authorizes an action.
_Avoid_: Remediation

**Diagnostic context**:
Server-side request correlation, nested debugging metadata, and flat telemetry attributes associated with an error. It is separate from authored error details and client-facing response data.
_Avoid_: Diagnostic enrichment

**Error family**:
A group of related structured error conditions treated as one vocabulary by producers and handlers. Its members may share scope, diagnostic context, documentation, and reporting policy.

**VercelError-like data**:
Structured error fields recognized across package or realm seams while the original tagged value remains intact. Recognition leaves diagnostic contents unknown and does not establish producer trust, disclosure approval, or action authority.
_Avoid_: Cross-realm error

### Response Roles

**Authored status mapping**:
A prospective HTTP error status associated with an authored error or explicit response input. It is separate from error identity and becomes concrete only on an error response.
_Avoid_: calling the authored mapping "status"

**Error response data input**:
Caller-authored error identity and nested public error details supplied when no structured error value is available. It carries no HTTP status mapping. Identity and every field under `public` are approved for the intended recipient.
_Avoid_: Public error input

**Error response input**:
Error response data input with an optional authored HTTP status mapping.
_Avoid_: Error response params

**Error response data**:
Client-facing identity and details for HTTP responses and other message channels. This data excludes HTTP status and diagnostic context. Its shape does not verify who sent it.
_Avoid_: Error response payload

**Error response**:
The HTTP status, body, and headers for an error, separate from a Web `Response` object.
_Avoid_: Error response result

**Client response reading**:
Consuming a native Web response as an error response by checking its status and media type, validating its response data, and reconstructing an error with locally observed context. Reading does not report the error or establish trust in its producer.
_Avoid_: Client error handling

### Presentation

**Terminal frame**:
A human-readable terminal presentation of an error header and optional detail, hint, fix, and link sections. It is presentation for readers, not a protocol for software.
_Avoid_: Formatted error
