# Complete ANSI content negotiation

## Context

Substring matching selected ANSI even when `Accept` said `q=0`. ANSI used a generic text media type, and missing `Vary` could let caches reuse the wrong format.

## Decision

- `X-Error-Format` wins when present. Only exact `ansi` selects ANSI; other values select JSON.
- Otherwise, an exact `text/plain+ansi` range in `Accept` needs valid `q > 0` (default `1`). Match the media type and `q` name without case sensitivity; duplicates use the highest valid `q`.
- An exact `Accept` range may specify UTF-8. Other charsets and unsupported parameters cannot select ANSI. If exact ranges exist but none qualifies, select JSON without checking `User-Agent`.
- If the exact range is absent, the existing case-sensitive `curl/` marker selects ANSI. Wildcards do not select ANSI.
- ANSI responses use `Content-Type: text/plain+ansi; charset=utf-8`. If request headers were supplied, JSON and ANSI responses include `Vary: X-Error-Format, Accept, User-Agent`.
- Keep `fromHttpResponse()` JSON-only.

## Reason

Clients can decline ANSI with `q=0` or an unsupported charset. `Vary` tells caches which headers choose the format. Only `text/plain+ansi` needs parsing here; [RFC 9110 quality values](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2) and [Accept](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1) define the rules.
