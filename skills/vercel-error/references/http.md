# Response data and HTTP boundaries

Use this reference for producing and consuming `ErrorResponseData`, building HTTP response fields, and reading a Web `Response`.

## Data producer

`buildErrorResponseData()` is available from `@vercel/error/server` in 0.5.0 and later. Check the installed version and exports first. The entry works in browser, worker, edge, and Node runtimes.

```ts
import {
  buildErrorResponseData,
  type ErrorResponseData,
  type ErrorResponseDataInput,
} from '@vercel/error/server';

const input: ErrorResponseDataInput = {
  scope: 'roster',
  code: 'unavailable',
  public: { message: 'The roster is temporarily unavailable.' },
};
const data: ErrorResponseData = buildErrorResponseData(input);
const toolResult = { success: false, ...data };
```

The builder accepts valid tagged errors, including local `VercelError` instances. Tagged errors without `public` keep their identity and use `An error occurred.` Untagged input requires nested `public`; a top-level `message` never substitutes for it.

Non-object input, invalid identity or public details, malformed tagged data, plain `Error` values, untagged objects with `name` or `stack`, and missing `public` throw `TypeError`. The structural signature cannot prove a value carries a valid tag.

Each call returns fresh mutable plain data containing only identity and approved text. It does not write to the source, report, perform I/O, negotiate a format, or call source methods. Getters and Proxy traps can run; their exceptions propagate.

Data production does not select or range-check HTTP status. Tagged validation still requires numeric `statusCode` when set; `errorResponse()` separately requires an integer from 400 through 599. `ErrorResponseInput` extends `ErrorResponseDataInput` with optional `statusCode`.

Approve scope and code as well as public text for the recipient. Shape and the forgeable tag do not authenticate the producer or authorize recovery actions. Logs need a separate [allowlist](create-errors.md#allowlisted-logging).

Applications own tool and message schemas. Update them and their consumers before adding the envelope; project `data.error.message` into an existing field when needed.

## HTTP producer

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

Pass `request` to choose JSON or ANSI from headers. Both formats use the same client-approved fields. Selection follows this order:

1. `X-Error-Format` wins when present. Only exact `ansi` selects ANSI; other values select JSON.
2. Otherwise, check exact `text/plain+ansi` ranges in `Accept`. A valid `q > 0` selects ANSI; missing `q` counts as `1`. Match the media type and `q` name without case sensitivity. Duplicates use the highest valid `q`.
3. Unsupported parameters, including a non-UTF-8 charset, cannot select ANSI. If exact ranges exist but none qualifies, use JSON without checking `User-Agent`.
4. If no exact range exists, a case-sensitive `curl/` in `User-Agent` selects ANSI. Wildcards do not select ANSI.

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

Explicit input and `VercelError` both use `statusCode`. The returned result and native `Response` use the concrete property `status`. A top-level `message` never substitutes for `public.message`.

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

`message` is required and nonblank. `scope` and `code` must be nonblank when present. Blank optional `reason`, `hint`, `fix`, and `link` fields are omitted; other text stays unchanged.

`ErrorResponseData` excludes HTTP status, request ID, cause, stack, developer name, metadata, and attributes. For HTTP, use the observed response status. Check the source before forwarding data through another channel.

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

Parsing requires a nonblank `message`, plus nonblank `scope` and `code` when present. A wrong type in any known field rejects the data. Blank optional fields are omitted; unknown fields are ignored.

`fromErrorResponseData()` copies parsed fields into a new error. Supply local context and, for HTTP, the observed response status.

Parsing validates shape only. It does not authenticate the producer, make the fields safe for a different recipient, or authorize an action. Verify the producer and review all fields before forwarding them; validate permissions, parameters, and side effects before following a fix or link. Apply the [Recovery authority rules](contract-design.md#recovery-authority).

## Boundary checks

For data producers, test the public import, approved fields, diagnostic exclusions, and serialization followed by parsing and reconstruction. For HTTP, test body, concrete status, and headers together. Cover nested public input, rejection of legacy flat input, the generic fallback, scope/code disclosure, malformed known fields, unknown fields, reconstruction with the observed response status, and JSON/ANSI parity. If diagnostics callbacks are wired, test ordering and synchronous failure propagation.
