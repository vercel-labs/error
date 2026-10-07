# Core errors

Use `VercelError` for one structured failure or a direct subclass.

## Typed construction

```ts
import { VercelError } from '@vercel/error';

type PaymentErrorCode = 'card_declined' | 'gateway_timeout' | 'payment_failed';

export function paymentGatewayTimeout(
  cause: unknown,
  providerResponseCode?: string,
): VercelError<PaymentErrorCode> {
  return new VercelError('Gateway request timed out', {
    cause,
    code: 'gateway_timeout',
    metadata: {
      provider: { responseCode: providerResponseCode },
    },
    public: { message: 'The payment provider did not respond' },
    scope: 'billing',
  });
}
```

The generic keeps `code` limited to `PaymentErrorCode`. Preserve a caught value through `cause`; do not copy its message or stack into public fields.

When set, `scope` and `code` must be nonblank. Construction keeps their original text.

If `public` is set, its `message` must be nonblank and optional fields must be strings. Construction drops blank optional and unknown fields, then freezes a copy. Invalid fields throw `TypeError`.

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

- `isVercelError(value)` uses `instanceof` first, then a package-namespaced Symbol tag plus data-shape checks. Recognition works only while the tag remains observable; JSON, structured clone, `Worker`, and `MessagePort` transfer do not preserve it.
- `hasCode(error, codeOrCodes)` narrows errors by one code or a set of codes.
- `isError`, `isErrorLike`, and `getMessage` handle unknown caught values without unsafe casts. `isErrorLike` guarantees only a string `message`.
- `getRootCause` follows `cause` and stops on object cycles.

`VercelErrorLike` remains structural. It describes error fields but does not require the package marker.

`RecognizedVercelError` adds the marker and is the tagged input accepted by `buildErrorResponseData()` and `errorResponse()`.

Local `VercelError` instances, subclasses, and factory results satisfy the type. `isVercelError()` narrows unknown or structurally typed values to it.

Errors from older or duplicate package copies remain recognizable while their shared marker and valid fields are observable.

Version 0.6.0 requires recognized errors in producer types. Version 0.5.0 rejects untagged errors at runtime, but its declarations allow those calls.

If a variable was annotated as `VercelErrorLike`, retain the concrete error type or narrow it with `isVercelError()` before response production. Do not add a cast. Plain errors and field objects remain usable with `formatError()`.

A custom constructor compiled against older package declarations may need a dependency update before it can be passed to the current `createErrors()`. Recognizing an instance with `isVercelError()` does not change its constructor type.

The Symbol tag is forgeable. Recognition does not authenticate the producer or authorize disclosure. Tagged metadata and attributes remain `unknown`; validate them or use `instanceof VercelError` for typed local diagnostics.

`VercelError#toJSON()` includes developer and diagnostic details, though it excludes `cause`; it may contain private data. Use `buildErrorResponseData()` for recipient-approved data or `errorResponse()` for HTTP. See [Response data and HTTP](http.md) and the separate [log allowlist](create-errors.md#allowlisted-logging).
