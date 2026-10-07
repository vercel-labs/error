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

`VercelErrorLike` describes fields and remains structural; it does not prove that a value carries the package marker. `RecognizedVercelError` adds the existing marker and is the tagged input accepted by `buildErrorResponseData()` and `errorResponse()`. Local `VercelError` instances, subclasses, and factory results satisfy that type. `isVercelError()` narrows an unknown or structurally annotated value to it.

Older or duplicate package copies remain recognizable while their shared marker and valid fields are observable. Recognition still does not authenticate the producer or approve disclosure.

The stronger producer signatures ship in 0.6.0. Version 0.5.0 already rejects untagged errors at runtime, but its declarations do not reject them at compile time.

If a variable was annotated as `VercelErrorLike`, retain the concrete error type or narrow it with `isVercelError()` before response production. Do not add a cast. Plain errors and field objects remain usable with `formatError()`. A custom constructor compiled against older package declarations may need an update before its result is accepted by current response producer types.

The Symbol tag is forgeable. Recognition does not authenticate the producer or authorize disclosure. Tagged metadata and attributes remain `unknown`; validate them or use `instanceof VercelError` for typed local diagnostics.

`VercelError#toJSON()` includes developer and diagnostic details, though it excludes `cause`; it may contain private data. Use `buildErrorResponseData()` for recipient-approved data or `errorResponse()` for HTTP. See [Response data and HTTP](http.md) and the separate [log allowlist](create-errors.md#allowlisted-logging).
