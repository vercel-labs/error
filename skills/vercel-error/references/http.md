# HTTP boundaries

Use this reference for producing, validating, and reconstructing `ErrorResponse` JSON.

## Producer

Call `errorResponse(error)` without request headers to always return JSON. If the developer-facing `message` is private, set a client-safe `userMessage`. Also make `reason`, `hint`, `fix`, and `link` safe because JSON includes them. Without `userMessage`, JSON uses the developer-facing `message`.

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

Passing a `Request` or `HeadersLike` lets the caller request ANSI text. For a `VercelError`, ANSI output comes from `toString()` and may include the developer-facing `message`, `reason`, `hint`, `fix`, and `link`; it does not use `userMessage`. `X-Error-Format`, `Accept`, and `User-Agent` choose the format but do not authenticate the caller. Pass these headers only after authorizing the caller to see those fields. Otherwise call `errorResponse(error)` without the request and make every JSON-visible field client-safe.

Plain parameter input has no separate `userMessage`; its `message`, reason, hint, fix, and link are all client-facing.

If `VercelError.statusCode` or the plain parameter `status` is absent, `errorResponse()` returns status 500.

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

Validate unknown JSON before rebuilding an error. If parsing fails, keep the local HTTP failure instead of assuming the response is valid.

The application supplies `url` in this example.

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

`parseErrorResponse()` requires a non-empty string message, keeps non-empty optional strings, and drops invalid or unknown fields. It checks types, not who sent the response. Treat recovery fields as untrusted; before following a link or running a suggested fix, verify the sender and apply the [Recovery authority rules](contract-design.md#recovery-authority).

`fromErrorResponse()` copies the response message to both `message` and `userMessage`. The response's code, reason, hint, fix, and link take precedence over additional options. Pass the local status, scope, cause, metadata, attributes, and request ID through the options.

## Boundary checks

Test the serialized body, returned status, and headers together. Include a case where the developer message differs from `userMessage`, a malformed unknown response, and reconstruction with status and cause.

If ANSI negotiation is enabled, add a separate test for the diagnostic fields it exposes. Verify that an unauthenticated caller cannot expose them by spoofing format-preference headers.
