# HTTP boundaries

Use this reference for producing, validating, and reconstructing `ErrorResponse` JSON.

## Producer

Import `errorResponse` from the server entry point. Without a request or headers argument, it always returns JSON and avoids the ANSI diagnostic path. JSON is client-safe only when `userMessage` is set whenever `message` is private and every wire-visible reason, hint, fix, and link is also safe. Without `userMessage`, JSON falls back to the developer-facing message.

The following example assumes the application contract defines HTTP 503 and the exact client message for `deployment_unavailable`.

```ts
import { VercelError } from '@vercel/error';
import { errorResponse } from '@vercel/error/server';

export function deploymentErrorResponse(cause: unknown): Response {
  const error = new VercelError(
    'Deployment dep_123 failed against builder.internal',
    {
      cause,
      code: 'deployment_unavailable',
      scope: 'deployments',
      statusCode: 503,
      userMessage: 'Deployment is temporarily unavailable',
    },
  );

  const { status, body, headers } = errorResponse(error);
  return new Response(body, { status, headers });
}
```

Passing a `Request` or `HeadersLike` enables ANSI negotiation. For a `VercelError`, negotiated text calls `error.toString()` and therefore includes the developer-facing `message`, reason, hint, fix, and link rather than substituting `userMessage`. `X-Error-Format`, `Accept`, and `User-Agent` are caller-controlled preference signals, not authentication. Authenticate and authorize the caller before passing its request when those diagnostics are private. Otherwise call `errorResponse(error)` without the request to disable ANSI negotiation, and ensure `userMessage`, reason, hint, fix, and link satisfy the JSON safety requirements above.

Plain parameter input has no separate `userMessage`; its `message`, reason, hint, fix, and link are all client-facing.

## Wire contract

The JSON shape is:

```ts
interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    reason?: string;
    hint?: string;
    fix?: string;
    link?: string;
  };
}
```

`message` is required. The producer omits empty optional fields. It does not send status, scope, request ID, cause, stack, metadata, or attributes. `reason`, `hint`, `fix`, and `link` do cross the boundary, so keep them client-safe too.

Use the HTTP status outside the body. Do not infer it from a code unless the application owns and tests that mapping.

## Consumer

Validate unknown JSON before reconstruction. If parsing fails, keep the local HTTP failure rather than asserting the response shape.

Partial example: the application provides `url`.

```ts
import { fromErrorResponse, parseErrorResponse } from '@vercel/error/client';

const response = await fetch(url);

if (!response.ok) {
  const failedFetch = new Error(`${response.url} returned ${response.status}`);
  const parsed = parseErrorResponse(
    await response.json().catch(() => undefined),
  );

  if (!parsed) {
    throw failedFetch;
  }

  throw fromErrorResponse(parsed, {
    cause: failedFetch,
    scope: 'deployments-client',
    statusCode: response.status,
  });
}
```

`parseErrorResponse()` requires a non-empty string message. It keeps valid non-empty optional string fields and drops invalid or unknown fields.

That validation proves shape, not provenance or safety. Treat wire-provided reason, hint, fix, and link values as untrusted input. Do not execute a remediation or follow a link until the upstream identity and local policy authorize it.

`fromErrorResponse()` makes the wire message both `message` and `userMessage`. Wire code, reason, hint, fix, and link win over additional options. Reintroduce locally owned status, scope, cause, metadata, attributes, and request ID through its options.

## Boundary checks

Test the serialized body, returned status, and headers together. Include a case where the developer message differs from `userMessage`, a malformed unknown response, and reconstruction with status and cause.

If ANSI negotiation is enabled, add a separate test proving exactly which diagnostic fields the negotiated text exposes and that spoofed preference headers cannot bypass the application's authorization boundary.
