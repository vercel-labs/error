# Complete ANSI content negotiation

## Context

Substring matching treats `q=0` as a request for ANSI. ANSI responses also use a generic text media type and omit the cache signal for request-selected representations.

## Decision

- A present `X-Error-Format` is authoritative. Only its exact `ansi` value selects ANSI.
- Otherwise, an exact case-insensitive `text/plain+ansi` Accept range selects ANSI for a valid positive quality value. An omitted `q` means `1`. For duplicate exact ranges, use the highest valid quality. A matching range with only zero or invalid weights selects JSON and skips the User-Agent fallback.
- If the exact Accept range is absent, the existing case-sensitive `curl/` marker selects ANSI. Wildcards do not select ANSI.
- ANSI responses use `Content-Type: text/plain+ansi; charset=utf-8`. If request headers were supplied, JSON and ANSI responses include `Vary: X-Error-Format, Accept, User-Agent`.
- Keep `fromHttpResponse()` JSON-only.

## Reason

Clients can decline terminal escape sequences with their quality value, and caches can distinguish responses selected from request headers. The private parser remains limited to the one supported media range and follows [RFC 9110 quality values](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2) and [Accept semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1).
