# HTTP boundaries

Use this reference for producing `ErrorResponse`, consuming a Web `Response`, validating `ErrorResponseData`, and reconstructing errors.

## Producer

Put every client-approved prose field under `public`. A `VercelError` without `public` receives the fixed response message `An error occurred.`; developer prose never fills the response.

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

`statusCode` must be an integer from 400 through 599. Omission defaults to 500. Invalid values throw before the response body is built or diagnostics run.

Pass `request` to let its headers select JSON or ANSI text. Both formats use the same client-approved fields. Selection follows this order:

1. If `X-Error-Format` is present, only the exact value `ansi` selects ANSI. Any other value selects JSON.
2. Otherwise, an exact, case-insensitive `text/plain+ansi` range in `Accept` selects ANSI with a valid positive `q`. Missing `q` means `1`; duplicate ranges use the highest valid `q`.
3. Unsupported media parameters, including a charset other than UTF-8, cannot select ANSI. Exact ranges with only zero, invalid, or unsupported values select JSON.
4. If the exact range is absent, a case-sensitive `curl/` in `User-Agent` selects ANSI. Wildcards do not select ANSI.

These headers choose a format. They do not authenticate the caller or authorize disclosure.

JSON uses `Content-Type: application/json`. ANSI uses `Content-Type: text/plain+ansi; charset=utf-8`. Whenever `request` is supplied, both include `Vary: X-Error-Format, Accept, User-Agent`. Without `request`, `Vary` is omitted.

Scope, code, and status are public disclosures even when the generic message is used. Protected-resource handlers own neutral mappings that do not reveal whether a resource exists.

### Explicit public input

`ErrorResponseInput` requires nested `public` details. Treat every field under `public` as approved for the response:

```ts
const result = errorResponse({
  scope: 'api',
  code: 'rate_limited',
  statusCode: 429,
  public: {
    message: 'Too many requests.',
    hint: 'Wait before retrying.',
  },
});
```

Explicit input and `VercelError` both use `statusCode`. The returned result and native `Response` use the concrete property `status`. An untagged top-level `message` is rejected.

Pass native, cross-realm, or Proxy-wrapped `Error` values through `cause` on a `VercelError`. `errorResponse()` rejects untagged Error-shaped objects and inputs without nested `public` details.

### Serialization diagnostics

`onSerialize` runs synchronously after the complete response is built:

```ts
import { VercelError } from '@vercel/error';

const result = errorResponse(error, {
  onSerialize: (source, context) => {
    if (source instanceof VercelError) {
      recordErrorResponse(source.attributes, context);
    }
  },
  request,
});
```

The callback receives the original source plus `{ status, bodyFormat }`. `bodyFormat` is `json` or `ansi` and describes the serialized body. Tagged cross-realm metadata and attributes remain `unknown`; validate them or use `instanceof VercelError` for typed local diagnostics. The callback returns `undefined`; TypeScript rejects async callbacks. Synchronous callback errors propagate and replace the response the caller would otherwise receive.

## Response data contract

`message` is required and nonblank. When set, `scope` and `code` must also be nonblank. Blank optional `reason`, `hint`, `fix`, and `link` fields are omitted; other text is kept exactly as given.

`ErrorResponseData` excludes HTTP status, request ID, cause, stack, developer name, metadata, and attributes. Use the actual HTTP status. The data can be sent as JSON or through another message channel after checking its source. It does not carry full diagnostics.

The body is the Vercel REST API error envelope, not RFC 9457 problem details; that stance is deliberate. When an integration requires `application/problem+json`, translate in the application: `code` plus `link` map to `type`, `message` maps to `detail`, and the other fields become extension members.

## Consumer

Use `fromHttpResponse()` to validate and reconstruct a package error. Retain the local HTTP failure when the response is not a valid package response.

```ts
import { fromHttpResponse } from '@vercel/error/client';

const response = await fetch(url);

if (!response.ok) {
  const failedFetch = new Error(`${response.url} returned ${response.status}`);
  const error = await fromHttpResponse(response, { cause: failedFetch });

  reporter.captureException(error ?? failedFetch);
  throw error ?? failedFetch;
}
```

`fromHttpResponse()` accepts only 400 through 599 responses with an `application/json` content type and valid `ErrorResponseData`. It uses the observed status and reads `x-vercel-id` into `requestId` by default. An explicit `requestId` wins. Set `requestIdHeader` to another header name or to `false` to skip lookup. Cross-origin browser responses must expose a non-safelisted request ID header through `Access-Control-Expose-Headers`.

The function returns `undefined` without consuming non-error or non-JSON responses. Once it attempts JSON parsing, the body is consumed even if parsing or validation fails. It does not report or create a fallback.

Use `parseErrorResponseData()` for unknown decoded data. Use `fromErrorResponseData()` to make a `VercelError` from data that passed parsing.

Parsing requires a nonblank `message` and nonblank `scope` or `code` when present. A known field with the wrong type rejects the whole response. Blank optional public fields are omitted; unknown fields are ignored so new fields can be added later. The new error copies response fields. The caller supplies local context and the observed HTTP status.

Parsing validates shape only. It does not authenticate the producer, make the fields safe for a different recipient, or authorize an action. Verify the producer and review all fields before forwarding them; validate permissions, parameters, and side effects before following a fix or link. Apply the [Recovery authority rules](contract-design.md#recovery-authority).

## Boundary checks

Test body, concrete status, and headers together. Cover nested public input, rejection of legacy flat input, the generic fallback, scope/code disclosure, malformed known fields, unknown fields, reconstruction with the observed response status, and JSON/ANSI parity. If diagnostics callbacks are wired, test ordering and synchronous failure propagation.
