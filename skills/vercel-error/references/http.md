# HTTP boundaries

Use this reference for producing `ErrorResponse`, validating `ErrorResponseData`, and reconstructing errors.

| Type                 | Role                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `ErrorResponseInput` | Flat caller-authored input whose prose is explicitly client-approved |
| `ErrorResponseData`  | Normalized structured data shared by JSON, ANSI, and reconstruction  |
| `ErrorResponse`      | Concrete status, serialized body, and response headers               |

## Producer

Put every client-approved prose field under `public`. A `VercelError` without `public` receives the fixed wire message `An error occurred.`; developer prose never fills the response.

The example assumes the application contract approves HTTP 503, the `deployments:deployment_unavailable` identity, and the public copy.

```ts
import { VercelError } from '@vercel/error';
import { errorResponse, type ErrorResponse } from '@vercel/error/server';

export function deploymentErrorResponse(
  cause: unknown,
  request: Request,
): Response {
  const error = new VercelError(
    'Deployment dep_123 failed against builder.internal',
    {
      cause,
      code: 'deployment_unavailable',
      scope: 'deployments',
      statusCode: 503,
      reason: 'The internal builder stopped before producing an artifact.',
      public: {
        message: 'The deployment is temporarily unavailable.',
        fix: 'Try the deployment again shortly.',
      },
    },
  );

  const result: ErrorResponse = errorResponse(error, { request });
  return new Response(result.body, result);
}
```

`statusCode` must be an integer from 400 through 599. Omission defaults to 500. Invalid values throw before public projection or diagnostics run.

Passing `request` through the options enables ANSI negotiation. JSON and ANSI text contain the same public identity and prose. A present `X-Error-Format` header is authoritative; only `ansi` selects ANSI. Otherwise `Accept` and `User-Agent` provide fallbacks. These headers choose the representation; they do not authenticate the caller.

Scope, code, and status are public disclosures even when the generic message is used. Protected-resource handlers own neutral mappings that do not reveal whether a resource exists.

### Plain public input

`ErrorResponseInput` is flat and has no developer/public split. Treat every supplied prose field as approved for the response:

```ts
const result = errorResponse({
  scope: 'api',
  code: 'rate_limited',
  statusCode: 429,
  message: 'Too many requests.',
  hint: 'Wait before retrying.',
});
```

Plain input and `VercelError` both use `statusCode`. The returned result and native `Response` use the concrete property `status`.

Pass native, cross-realm, or Proxy-wrapped `Error` values through `cause` on a `VercelError`. `errorResponse()` rejects untagged Error-shaped objects instead of treating their developer message as public flat input.

### Serialization diagnostics

`onSerialize` runs synchronously after the complete response is built:

```ts
import { isVercelError } from '@vercel/error';

const result = errorResponse(error, {
  onSerialize: (source, context) => {
    if (isVercelError(source)) {
      recordErrorResponse(source.attributes, context);
    }
  },
  request,
});
```

The callback receives the original source plus `{ status, representation }`, so server-side instrumentation can inspect metadata and attributes. Those values retain the source's trust level. The callback returns `undefined`; TypeScript rejects async callbacks. Synchronous callback errors propagate and replace the response the caller would otherwise receive.

## Response data contract

```ts
interface ErrorResponseData {
  readonly error: {
    readonly scope?: string;
    readonly code?: string;
    readonly message: string;
    readonly reason?: string;
    readonly hint?: string;
    readonly fix?: string;
    readonly link?: string;
  };
}
```

`message` is required and nonblank. `ErrorResponseData` excludes HTTP status, request ID, cause, stack, developer name, metadata, and attributes. Use the actual response status outside this data.

## Consumer

Validate unknown JSON before rebuilding an error. If parsing fails, retain the local HTTP failure instead of assuming the upstream response is trustworthy.

```ts
import { fromErrorResponse, parseErrorResponse } from '@vercel/error/client';

const response = await fetch(url);

if (!response.ok) {
  const failedFetch = new Error(`${response.url} returned ${response.status}`);
  const parsed = parseErrorResponse(
    await response.json().catch(() => undefined),
  );

  if (!parsed) throw failedFetch;

  throw fromErrorResponse(parsed, {
    cause: failedFetch,
    requestId: response.headers.get('x-request-id') ?? undefined,
    statusCode: response.status,
  });
}
```

`parseErrorResponse()` requires a nonblank string message. A present known field with the wrong type rejects the entire response. Unknown fields are ignored for additive evolution.

`fromErrorResponse()` copies wire identity and prose into the reconstructed developer fields and stores the same prose under `public`. The caller supplies only status, cause, request ID, metadata, and attributes. The real response status is authoritative.

Parsing validates shape, not producer trust or permission to act. Treat fixes and links as untrusted data. Verify the sender, permissions, parameters, and side effects before following them; apply the [Recovery authority rules](contract-design.md#recovery-authority).

## Boundary checks

Test body, concrete status, and headers together. Cover explicit public prose, the generic fallback, scope/code disclosure, malformed known fields, unknown fields, reconstruction with the observed response status, and JSON/ANSI parity. If diagnostics callbacks are wired, test ordering and synchronous failure propagation.
