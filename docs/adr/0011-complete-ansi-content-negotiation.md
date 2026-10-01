# Complete ANSI content negotiation

## Context

Substring matching selects ANSI even when `Accept` says `q=0`. ANSI responses use a generic text media type. Responses also omit `Vary`, so caches may reuse the wrong format.

## Decision

- A present `X-Error-Format` is authoritative. Only its exact `ansi` value selects ANSI.
- Otherwise, an exact, case-insensitive `text/plain+ansi` range in `Accept` selects ANSI when its `q` value is valid and positive. Missing `q` means `1`; duplicate ranges use the highest valid value.
- The range may request UTF-8. An unsupported charset or other unsupported media parameter cannot select ANSI. Zero, invalid, or unsupported ranges select JSON and skip the User-Agent fallback.
- If the exact range is absent, the existing case-sensitive `curl/` marker selects ANSI. Wildcards do not select ANSI.
- ANSI responses use `Content-Type: text/plain+ansi; charset=utf-8`. If request headers were supplied, JSON and ANSI responses include `Vary: X-Error-Format, Accept, User-Agent`.
- Keep `fromHttpResponse()` JSON-only.

## Reason

Clients can decline terminal escape sequences through `q=0` or an unsupported charset. `Vary` tells caches which request headers affect the format. The private parser handles only this media type and its parameters, following [RFC 9110 quality values](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2) and [Accept](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.5.1).
