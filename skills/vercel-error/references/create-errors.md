# `createErrors` factories

Use `createErrors` when several errors share a scope, reporter, documentation base, metadata, attributes, or custom class.

The details below can vary by package version. Verify them against the selected installed package before applying them.

## Typed factory

```ts
import { createErrors } from '@vercel/error';
import type { VercelError } from '@vercel/error';

type PaymentErrorCode = 'card_declined' | 'gateway_timeout' | 'payment_failed';

export function makePaymentErrors(
  report: (error: VercelError<PaymentErrorCode>) => void,
) {
  return createErrors<PaymentErrorCode>({
    attributes: { 'service.name': 'billing-api' },
    report,
    scope: 'billing',
  });
}
```

The returned factory always has three methods:

- `create()` returns the new error.
- `raise()` throws the new error without reporting it.
- `report()` calls the reporter synchronously and returns the same error. Synchronous reporter errors propagate. Returned promises are not awaited or handled, so an async reporter must handle its own rejection.

Without a `report` callback, `report()` uses `console.error`.

## Shared values

Factory and per-error `metadata` and `attributes` merge one level deep, with per-error keys winning. Nested objects are replaced rather than merged recursively.

`docsBaseUrl` can be a string or a function. A string trims trailing slashes and appends the code without changing it. A per-error `link` takes precedence.

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

export function makePaymentErrors(report: (error: PaymentError) => void) {
  return createErrors<PaymentErrorCode, PaymentError>({
    ErrorClass: PaymentError,
    report,
    scope: 'billing',
  });
}
```

`ErrorClass` must accept `message` plus optional standard `VercelErrorOptions<TCode>` and return a `VercelError<TCode>` subtype. The factory passes no third argument. Its method types do not declare subclass-specific per-error options, so the class must remain callable with standard options.

Prefer inference from `ErrorClass`. If you pass `TError` explicitly, also supply the matching `ErrorClass`; otherwise the runtime creates a base `VercelError` while callers are typed as the subclass. Passing only `TCode` selects the default base-error return type, so callers lose subclass-specific members.
