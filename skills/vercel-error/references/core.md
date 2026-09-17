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

Construction validates `public` (nonblank string `message`, optional string details, `TypeError` otherwise), drops unknown fields, and stores a frozen copy. Build the complete client-approved projection before creating the error rather than mutating it later.

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

The Symbol tag is forgeable. Recognition does not authenticate the producer or authorize disclosure. Tagged metadata and attributes remain `unknown`; validate them or use `instanceof VercelError` for typed local diagnostics.

`VercelError#toJSON()` includes the name, developer message, optional stack, public projection, and defined enumerable fields such as metadata and attributes; it excludes `cause`. Because that output may contain private diagnostics, do not send it to clients. Use `errorResponse()` for public HTTP responses.
