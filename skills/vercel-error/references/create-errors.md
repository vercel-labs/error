# `createErrors` factories

Use `createErrors` when several errors share a scope, documentation base, metadata, attributes, reporting callback, or custom class. Verify the selected installed package before applying version-specific details.

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

Without `onReport`, `report()` uses `console.error`. Synchronous callback errors propagate and replace the value `report()` would have returned. The callback type returns `undefined`, so TypeScript rejects async callbacks. Record thrown errors at the operation boundary rather than adding reporting to `raise()` and risking duplicate telemetry.

## Shared values

Factory and per-error `metadata` and `attributes` merge one level deep, with per-error keys winning. Nested objects are replaced rather than merged recursively.

`docsBaseUrl` can be a string or a function. A string trims trailing slashes and appends the code without changing it. A per-error developer `link` takes precedence. The factory never derives `public.link`; set client-approved links explicitly under each error's `public` projection.

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
