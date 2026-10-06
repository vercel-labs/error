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

A coding agent reads a GitHub issue before fixing a bug. If the request fails, its tool reports once and returns approved error data. Use `onReport` to allowlist log fields and values; types alone do not make provider data safe.

```ts
import { createErrors, hasCode } from '@vercel/error';

const codes = [
  'unavailable',
  'configuration_failed',
  'unknown_failure',
] as const;
type GitHubIssueCode = (typeof codes)[number];

const githubErrors = createErrors<GitHubIssueCode>({
  scope: 'github',
  onReport(error) {
    const status = error.attributes?.['upstream.status'];
    const isAllowedStatus =
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599;
    const code = hasCode(error, codes) ? error.code : 'unknown_failure';
    const fields = {
      scope: 'github',
      code,
      ...(isAllowedStatus ? { upstreamStatus: status } : {}),
    };

    console.error('github_issue_fetch_failed', fields);
  },
});

function reportGitHubIssueFailure(
  cause: unknown,
  code: GitHubIssueCode,
  upstreamStatus?: number,
) {
  return githubErrors.report('GitHub issue request failed', {
    code,
    cause,
    attributes: { 'upstream.status': upstreamStatus },
    public: { message: 'We could not retrieve the GitHub issue.' },
  });
}
```

`hasCode(error, codes)` checks membership at runtime. The application defines the list and the fallback.

The application maps GitHub HTTP 503 to `unavailable`, missing integration credentials to `configuration_failed`, and unrecognized failures to `unknown_failure`. For the 503 case, `github_issue_fetch_failed` logs:

```json
{
  "scope": "github",
  "code": "unavailable",
  "upstreamStatus": 503
}
```

The original failure remains in `cause`. The log excludes it, repository names, issue contents, credentials, and raw provider messages. Pass the reported error to [`buildErrorResponseData`](http.md#data-producer) for the tool result.

- Never spread `error`, `metadata`, or `attributes` into logs; `toJSON()` includes diagnostics.
- `public` text is approved for the response recipient only. Set separate log access and retention rules.
- `report()` returns the same error after `onReport`; call it once at the operation that owns the final failure. Callback exceptions propagate, so define how the log sink handles failures.
- Keep upstream status in diagnostic `attributes`. Reserve `statusCode` for an HTTP response mapping.

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
