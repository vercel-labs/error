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

Use `onReport` to build a named fields object from approved keys and values. Types alone do not approve provider data. The [GitHub issue tool](https://github.com/vercel-labs/error/tree/main/examples/github-issue-tool) is the executable example, with one implementation for source tests and packed-package execution.

For `github_issue_fetch_failed`, the application permits only:

| Field            | Approved value                                              |
| ---------------- | ----------------------------------------------------------- |
| `scope`          | `github`                                                    |
| `operation`      | `getGitHubIssue`                                            |
| `stage`          | The locally observed `setup` or `request` stage             |
| `code`           | `configuration_failed`, `unavailable`, or `unknown_failure` |
| `retryable`      | Boolean, true only for `unavailable`                        |
| `upstreamStatus` | Optional observed integer HTTP status from 400 through 599  |

Keep a qualifying status in `attributes['upstream.status']`, then validate its type and range before adding it to the log. A redirect remains in the local diagnostic cause but is omitted from this error-status field. Reserve `statusCode` for an authored HTTP response mapping; this tool produces no HTTP response.

The operation owns its classification and recipient-approved guidance:

| Observation                                  | Code and stage                           | Approved message                                                                        |
| -------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Missing or blank token                       | `configuration_failed`, `setup`          | GitHub is not configured. Configure the application's GitHub credentials and try again. |
| Observed HTTP 503                            | `unavailable`, `request`                 | We could not retrieve the GitHub issue. Try again later.                                |
| Other non-200 response or unexpected failure | `unknown_failure`, stage where it failed | We could not retrieve the GitHub issue. Check the application logs.                     |

A rejected value's status, code, scope, or public text is not an observed response. Wrap even recognized provider errors with locally authored classification and guidance. A 404 receives the neutral fallback without claiming whether a protected issue exists. Retry advice does not schedule a request, and false does not establish that the failure is permanent.

For an observed 503, the log contains exactly:

```json
{
  "scope": "github",
  "operation": "getGitHubIssue",
  "stage": "request",
  "code": "unavailable",
  "retryable": true,
  "upstreamStatus": 503
}
```

Capture setup/request failures first, keeping the original thrown value by identity in `cause`. For a non-200 response, create a local diagnostic error with its observed status and no raw body. Call `report()` once outside that catch, then pass its result to [`buildErrorResponseData`](http.md#data-producer). The tool returns `{ success: false, reason: 'github_failed', nextStep }`, taking `nextStep` from `data.error.message`.

- Logs and failure results exclude tokens, headers, repository names, issue contents, raw provider messages, stack, cause, metadata, and unapproved attributes. Never spread `error`, `metadata`, or `attributes`; diagnostic `toJSON()` is not a safe log projection.
- `public` text is approved for the response recipient only. Set separate log access and retention rules.
- Callback exceptions propagate. Keep reporting outside the provider catch so a sink failure escapes unchanged, without a second report or provider-failure result.
- If a reporter accepts externally supplied codes, use `hasCode(error, allowedCodes)` to check membership and select a locally approved fallback. The tool reports only locally authored codes.

The example tests use fake credentials, committed fixtures, native responses, and fail-closed HTTP delivery. They cover the complete tool flow with mocked GitHub, including independent network-violation checks. They do not establish live authentication, permissions, networking, availability, or ongoing provider compatibility. Credential discovery, OAuth, SDKs, raw argument validation, retries, deadlines, caching, comments, search, and writes are outside the example.

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
