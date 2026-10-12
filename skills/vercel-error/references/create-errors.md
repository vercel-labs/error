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

A supplied `onReport` receives the original error synchronously, returns `undefined`, and propagates callback errors. TypeScript rejects async callbacks. Report once at the final operation boundary; `create()` and `raise()` do not report. Terminal sanitization removes control sequences, not PII or confidential text, so reporter integrations must allowlist or scrub data.

## Allowlisted logging

Choose log fields and allowed values for the target application's logging policy. Build a named object in `onReport`; types alone do not approve values for logging.

This example logs a locally chosen scope and codes from an explicit allowlist:

```ts
import { createErrors, hasCode } from '@vercel/error';

const allowedCodes = [
  'unavailable',
  'invalid_input',
  'unknown_failure',
] as const;

export const serviceErrors = createErrors<(typeof allowedCodes)[number]>({
  scope: 'service',
  onReport(error) {
    const fields = {
      scope: 'service',
      code: hasCode(error, allowedCodes) ? error.code : 'unknown_failure',
    };
    console.error('operation_failed', fields);
  },
});
```

- Choose the scope, code list, fallback, event name, and any additional fields from the target project. Use `hasCode(error, allowedCodes)` for runtime membership checks; validate optional log values before adding them.
- Preserve original failures in `cause`. A provider's error identity or `public` text does not establish approval for your log or response recipient.
- Never spread `error`, `metadata`, or `attributes` into restricted logs. Diagnostic `toJSON()` may contain confidential data.
- `public` text is approved for the response recipient only. Set separate log field, access, and retention policies.
- Report once at the operation that owns the final failure. Keep reporting outside the catch for operation failures so callback exceptions propagate without another report.
- For HTTP integrations, keep observed provider status in diagnostic `attributes`. Reserve `statusCode` for an authored HTTP response mapping, and validate any logged status against the logging policy.

For a tool or message result, pass the reported error to [`buildErrorResponseData`](http.md#data-producer), then map its data to the application's result schema.

### Executable example

Read the [GitHub issue tool example](https://github.com/vercel-labs/error/tree/main/examples/github-issue-tool#failure-and-logging-policy) when you need a complete flow with mocked HTTP. Its codes, log fields, status mappings, retry advice, and result schema belong to that example application.

## Shared values

Factory and per-error `metadata` and `attributes` merge one level deep, with per-error keys winning. Nested objects are replaced rather than merged recursively.

`docsBaseUrl` can be a string or a function. A string trims trailing slashes and appends the code without changing it. A per-error developer `link` takes precedence. The factory never derives `public.link`; set recipient-approved links explicitly under each error's `public` fields.

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
