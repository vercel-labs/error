# Core errors

Use this reference for `VercelError`, `createErrors`, subclasses, guards, causes, metadata, and attributes.

## Choose a constructor

| Situation                                                        | Choice                                        |
| ---------------------------------------------------------------- | --------------------------------------------- |
| One structured failure                                           | `new VercelError(message, options)`           |
| Repeated errors sharing scope, reporter, metadata, or attributes | `createErrors(options)`                       |
| Domain behavior beyond structured fields                         | A `VercelError` subclass with a stable `name` |
| Simple local failure with no structured consumer                 | Native `Error`                                |

## Field contract

| Field         | Use                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `code`        | Stable machine-readable identity. Make it a string-literal union when callers branch on known codes.                         |
| `scope`       | Optional service or subsystem grouping. A factory injects it into every error.                                               |
| `statusCode`  | HTTP status used by `errorResponse`; defaults to 500 on the wire.                                                            |
| `message`     | Developer-facing statement of what happened.                                                                                 |
| `reason`      | Known explanation of why it happened. Do not restate `message`.                                                              |
| `hint`        | Advisory information that may help investigation.                                                                            |
| `fix`         | A concrete remediation known to resolve the failure.                                                                         |
| `link`        | A real documentation URL. A factory can derive it from `code` with `docsBaseUrl`.                                            |
| `userMessage` | Client-safe wording for JSON HTTP output.                                                                                    |
| `cause`       | Original error or value that triggered this error.                                                                           |
| `requestId`   | Correlation identifier already owned by the request or trace.                                                                |
| `metadata`    | Nested serializable debugging context. Excluded from `ErrorResponse`, but included by `toJSON()`.                            |
| `attributes`  | Flat OpenTelemetry-compatible scalar or homogeneous-array values. Excluded from `ErrorResponse`, but included by `toJSON()`. |

Populate only fields backed by facts. A missing `fix` is better than a confident but wrong command.

Treat status, client wording, remediation, retryability, and telemetry cardinality as application policy. Preserve them from requirements or inspected code; do not derive them from a code name or a familiar domain. A scalar attribute satisfies the telemetry type but is only low-cardinality when a verified bounded value set proves it.

## Typed construction

Partial example: the application provides `upstreamError`, `customerId`, and `providerResponse`.

```ts
import { VercelError } from '@vercel/error';

type PaymentErrorCode = 'card_declined' | 'gateway_timeout' | 'payment_failed';

const error = new VercelError<PaymentErrorCode>('Gateway request timed out', {
  attributes: { 'payment.provider': 'stripe' },
  cause: upstreamError,
  code: 'gateway_timeout',
  metadata: {
    customer: { id: customerId },
    provider: { responseCode: providerResponse.code },
  },
  scope: 'billing',
});
```

Do not move nested values into `attributes` to make them fit. Keep nested debugging data in `metadata`; reserve attributes for telemetry dimensions the observability system can index safely. Verify the expected value set before calling an attribute low-cardinality. Select explicit diagnostic fields; never attach whole requests, responses, headers, or provider payloads.

## Scoped factories

`createErrors()` always returns `create`, `raise`, and `report`. `report` uses the configured callback and defaults to `console.error` when none is supplied. `raise` throws without reporting.

Partial example: the application provides `sentry` and `upstreamError`.

```ts
import { createErrors } from '@vercel/error';

type PaymentErrorCode = 'card_declined' | 'gateway_timeout' | 'payment_failed';

const paymentErrors = createErrors<PaymentErrorCode>({
  attributes: { 'service.name': 'billing-api' },
  report: (error) => sentry.captureException(error),
  scope: 'billing',
});

const error = paymentErrors.create('Card was declined', {
  code: 'card_declined',
});

paymentErrors.raise('Gateway request timed out', {
  cause: upstreamError,
  code: 'gateway_timeout',
});

paymentErrors.report('Payment failed after authorization', {
  code: 'payment_failed',
});
```

Factory-level and per-error `metadata` and `attributes` merge shallowly, with per-error keys winning. Nested objects are replaced, not deep-merged.

`docsBaseUrl` may be a string or a resolver. A string trims trailing slashes and appends the code verbatim. An explicit per-error `link` wins.

## Subclasses

Accept `VercelErrorOptions` in the constructor so the class remains compatible with `createErrors`. Assign a literal `this.name`; minification can change `constructor.name`.

```ts
import { VercelError } from '@vercel/error';
import type { VercelErrorOptions } from '@vercel/error';

class PaymentError extends VercelError {
  constructor(message: string, options?: VercelErrorOptions) {
    super(message, options);
    this.name = 'PaymentError';
  }
}
```

## Recognition and extraction

- `isVercelError(value)` uses `instanceof` first and a stable Symbol tag as a cross-realm fallback.
- `hasCode(error, codeOrCodes)` narrows errors by one code or a set of codes.
- `isError`, `isErrorLike`, and `getMessage` handle unknown caught values without unsafe casts.
- `getRootCause` follows `cause` and stops on object cycles.

`VercelError#toJSON()` includes the name, message, optional stack, and defined enumerable fields, including metadata and attributes. It excludes `cause`. Do not send `toJSON()` directly to a client; use `errorResponse()` for the public wire contract.
