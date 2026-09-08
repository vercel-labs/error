# Sources for contract guidance

Primary sources behind the contract defaults. Cite these when an audit finding needs external evidence.

- [Google AIP-193: Errors](https://google.aip.dev/193) for stable machine identity, structured dynamic values, audience-specific messages, and help links.
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) for machine identity, HTTP status, prose that clients should not parse, extensibility, and disclosure risks.
- [Node.js errors](https://nodejs.org/api/errors.html#errorcode) for stable `error.code` and standard `Error.cause`.
- [OpenTelemetry error attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/error/#error-type) for stable error-type guidance.
- The development-status [OpenTelemetry recording errors](https://opentelemetry.io/docs/specs/semconv/general/recording-errors/) guidance for final outcomes and duplicate recording.
- [OWASP error handling](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html#objective) and [logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html#data-to-exclude) for public disclosure, trust, redaction, and limited diagnostics.
- [MCP tool results and errors](https://modelcontextprotocol.io/specification/latest/server/tools#error-handling) for structured tool failures, untrusted annotations, result validation, and human control of sensitive actions.
- [Vercel response headers](https://vercel.com/docs/headers/response-headers#x-vercel-id) for the public routing meaning of `x-vercel-id`. Any use as a correlation ID must come from the target project's own contract.
- [`@vercel/error` factory source](https://github.com/vercel-labs/error/blob/main/src/create-errors/index.ts), [value types](https://github.com/vercel-labs/error/blob/main/src/types.ts), and [response data](https://github.com/vercel-labs/error/blob/main/src/error-response-data/index.ts) for current package behavior.
