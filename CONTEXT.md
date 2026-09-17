# Structured Error Contract

`@vercel/error` defines a structured error contract with stable machine identity and separate developer and public details. It covers package and realm recognition, HTTP response data, diagnostics, and terminal presentation.

## Language

### Error Model

**Error identity**:
The stable `scope` and `code` values that software uses to classify an error. Identity remains stable when explanatory text changes.
_Avoid_: Error type

**Developer error details**:
Technical text intended for developers and operators diagnosing a failure. The details can state what failed, explain why, and provide recovery guidance or internal documentation.
_Avoid_: Internal error details

**Public error details**:
Text explicitly approved for disclosure to the intended recipient of an error response. Public describes a disclosure decision, not producer trust or authority to act.
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

**Error response input**:
Caller-authored error identity, nested public error details, and an authored status mapping supplied when no structured error value is available. Every field under `public` is approved for disclosure.
_Avoid_: Error response params

**Error response data**:
Client-facing data in one canonical shape, independent of source and body format, consisting of error identity and public error details. It excludes concrete HTTP status and diagnostic context and does not imply producer trust.
_Avoid_: Error response payload

**Error response**:
The complete concrete HTTP status, serialized body, and headers for an error. It is framework-neutral response information rather than a native or framework response object.
_Avoid_: Error response result

### Presentation

**Terminal frame**:
A human-readable terminal presentation of an error header and optional detail, hint, fix, and link sections. It is presentation for readers, not a protocol for software.
_Avoid_: Formatted error
