# `createErrors` factories

Use `createErrors` when several errors share a scope, documentation base, metadata, attributes, reporting callback, or custom class.

## Typed factory

```ts
import { createErrors } from '@vercel/error';

type PaymentErrorCode = 'card_declined' | 'gateway_timeout' | 'payment_failed';

export const paymentErrors = createErrors<PaymentErrorCode>({
  attributes: { 'service.name': 'billing-api' },
  onReport: (error) => {
    capturePaymentError(error);
  },
  scope: 'billing',
});
```

The returned factory always has three methods:

- `create()` returns the new error without reporting it.
- `raise()` throws the new error without reporting it.
- `report()` creates one error, calls `onReport` synchronously, then returns that error.

Without `onReport`, `report()` writes a sanitized developer frame to `console.error`. The default output omits raw stack inspection and enumerable diagnostics.

A supplied `onReport` receives the original error. Synchronous callback errors propagate instead of returning the error. The callback type returns `undefined`, so TypeScript rejects async callbacks. Record thrown errors at the operation boundary rather than adding reporting to `raise()` and risking duplicate telemetry.

Terminal sanitization removes control sequences, not PII or confidential prose. An `onReport` integration must allowlist or scrub data before transmission.

## Allowlisted logging

Use `onReport` to emit an application-defined log record. Keep each field and its accepted values explicit. A string or number type alone does not make provider data safe to log.

```ts
import { createErrors } from '@vercel/error';

const codes = [
  'unavailable',
  'configuration_failed',
  'unknown_failure',
] as const;
type RosterCode = (typeof codes)[number];

const rosterErrors = createErrors<RosterCode>({
  scope: 'roster',
  onReport(error) {
    const status = error.attributes?.['upstream.status'];
    const code =
      error.code !== undefined && codes.includes(error.code)
        ? error.code
        : 'unknown_failure';

    console.error('roster_failure', {
      scope: 'roster',
      code,
      ...(typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
        ? { upstreamStatus: status }
        : {}),
    });
  },
});

function reportRosterFailure(
  cause: unknown,
  code: RosterCode,
  upstreamStatus?: number,
) {
  return rosterErrors.report('Roster lookup failed', {
    code,
    cause,
    attributes: { 'upstream.status': upstreamStatus },
    public: { message: 'The roster could not be retrieved.' },
  });
}
```

The application classifies the provider failure before calling `reportRosterFailure`. An invocation with code `unavailable` and status `503` logs only:

```json
{
  "scope": "roster",
  "code": "unavailable",
  "upstreamStatus": 503
}
```

The event name is `roster_failure`. The original caught value remains in `cause` for controlled diagnosis and is excluded from this log record.

- Select approved values in `onReport`. Do not spread `error`, `metadata`, or `attributes` into logs.
- `toJSON()` includes diagnostic data. Terminal sanitization removes control sequences, not confidential content. Neither establishes a log disclosure policy.
- `public` text is approved for the intended response recipient. Log retention and access need a separate decision.
- Report once at the operation that owns the final failure. `create` and `raise` do not report. `report` creates, reports, and returns the same error.
- `onReport` is synchronous and returns `undefined`. Its exceptions propagate; the callback owns how to handle a failing log sink.
- Store an upstream status as diagnostic context. Reserve `statusCode` for an authored HTTP response mapping.

## Shared values

Factory and per-error `metadata` and `attributes` merge one level deep, with per-error keys winning. Nested objects are replaced rather than merged recursively.

`docsBaseUrl` can be a string or a function. A string trims trailing slashes and appends the code without changing it. A per-error developer `link` takes precedence. The factory never derives `public.link`; set client-approved links explicitly under each error's `public` fields.

## Custom error class

Apply the [subclass constructor and stable-name rules](core.md#subclasses) before passing a custom class to `ErrorClass`.

```ts
import { VercelError, createErrors } from '@vercel/error';
import type { VercelErrorOptions } from '@vercel/error';

type PaymentErrorCode = 'card_declined' | 'gateway_timeout';

class PaymentError extends VercelError<PaymentErrorCode> {
  readonly domain = 'payments';

  constructor(
    message: string,
    options: VercelErrorOptions<PaymentErrorCode> = {},
  ) {
    super(message, options);
    this.name = 'PaymentError';
  }
}

export const paymentErrors = createErrors({
  ErrorClass: PaymentError,
  onReport: (error) => {
    capturePaymentError(error);
  },
  scope: 'billing',
});
```

`ErrorClass` must accept `message` plus optional standard `VercelErrorOptions<TCode>`. The factory passes no third argument, and its methods accept no subclass-specific options.

Prefer inference from `ErrorClass`. If a caller supplies `TError` explicitly, the matching `ErrorClass` is required. Without `ErrorClass`, the factory returns and creates the base `VercelError<TCode>`.
