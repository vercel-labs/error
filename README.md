# @vercel/error

Native Error is enough while a failure stays local. Once software branches on it, an HTTP boundary exposes it, or a person or agent must recover from it, one message is forced to serve as machine identity, developer diagnosis, and client copy. `@vercel/error` separates those jobs: stable scope and code for software, rich diagnostics for operators, explicitly approved public details for clients, and safe terminal formatting for readers. The package has zero runtime dependencies.

Use the package when a caller needs stable identity, an HTTP boundary needs reviewed error data, or a person needs consistent recovery details. Keep native Error for local failures with no such caller.

## Install

```bash
pnpm add @vercel/error
```

Direct Node.js execution requires Node.js 24 or newer. The package is ESM-only and has no CommonJS export.

## Quick start

```ts
import { VercelError } from '@vercel/error';
import { errorResponse } from '@vercel/error/server';

export async function handleCheckout(
  checkoutConnection: () => Promise<void>,
): Promise<Response> {
  try {
    await checkoutConnection();
    return new Response(null, { status: 204 });
  } catch (cause) {
    const error = new VercelError(
      'Database shard failed to checkout a connection',
      {
        cause,
        code: 'pool_exhausted',
        scope: 'database',
        statusCode: 503,
        reason: 'All 20 connections are in use.',
        public: {
          message: 'The service is temporarily unavailable.',
        },
      },
    );
    const result = errorResponse(error);
    return new Response(result.body, result);
  }
}
```

The original failure stays in `cause`, and the constructor message and `reason` remain diagnostic. Only `public` supplies response prose; `scope` and `code` are separately disclosed in the body, while `statusCode` maps to the HTTP status. Read the [project narrative](https://github.com/vercel-labs/error/blob/main/docs/narrative.md) for the problem, alternatives, and adoption path.

## Agent guidance

The optional vercel-error skill helps coding agents choose fields, migrate existing errors, and review which details reach clients:

```bash
npx skills add vercel-labs/error --skill vercel-error
```

Installing the npm package does not activate the skill.

## Entry points

| Import                 | Exports                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@vercel/error`        | `VercelError`, `createErrors`, guards, extractors, shared types                                              |
| `@vercel/error/client` | `fromHttpResponse`, `parseErrorResponseData`, `fromErrorResponseData`, `ErrorResponseData`, and option types |
| `@vercel/error/server` | `errorResponse`, `wantsAnsi`, `ErrorResponseInput`, `ErrorResponse`, `ErrorResponseOptions`, `HeadersLike`   |
| `@vercel/error/format` | `formatError`, `frame`, `hint`, `fix`, `link`, format and section types                                      |

## Error contract

### Identity

`scope` and `code` form stable machine identity. When defined, each must be a nonblank string. Validation checks whitespace without trimming the value, so surrounding whitespace is preserved. Software should branch on these fields, never on rendered prose. The same rule applies to parsed responses on the client (see Consuming responses).

```ts
if (hasCode(error, 'pool_exhausted')) {
  // Apply an application-owned policy.
}
```

Keep codes stable when wording changes. A scope is useful when it names the service, package, or subsystem that owns the code.

Both fields are sent to clients. A code like `admin_key_invalid` reveals that the resource exists; where that matters, return a generic scope and code (or none) for protected resources.

### Developer context

The constructor `message` and optional `reason`, `hint`, `fix`, and `link` are developer-facing diagnostics. They are readonly after construction and appear in `toString()` and diagnostic `toJSON()` output.

| Field     | Meaning                                          |
| --------- | ------------------------------------------------ |
| `message` | What failed                                      |
| `reason`  | Why it failed, when the cause is known           |
| `hint`    | Advisory information that may help investigation |
| `fix`     | A known remediation and its required action      |
| `link`    | Documentation for the technical failure          |

Preserve an original failure through `cause`. Put nested debugging context in `metadata` and flat telemetry values in `attributes`.

### Client-facing details (`public`)

`public` is the only prose from a `VercelError` that `errorResponse()` sends to a client. If it is present, `public.message` is required and must be nonblank; the constructor validates this and throws `TypeError` for invalid details. Optional `reason`, `hint`, `fix`, and `link` values must be strings. Blank optional values are omitted; nonblank values are preserved exactly. The constructor copies and freezes `public` and drops unknown fields, so mutating the object you passed in later cannot change the approved copy.

```ts
interface PublicErrorDetails {
  readonly message: string;
  readonly reason?: string;
  readonly hint?: string;
  readonly fix?: string;
  readonly link?: string;
}
```

When `public` is absent from a `VercelError` or tagged value, `errorResponse()` uses the fixed message `An error occurred.`. It never falls back to developer prose. Untagged input must provide `public`. `docsBaseUrl` derives only the developer `link`; a public link must be set explicitly under `public.link`.

The fallback keeps developer text out of responses. `scope`, `code`, and the HTTP status still reach the client.

### Transport

`statusCode` is the HTTP status this error should get if it becomes an HTTP response. `errorResponse()` validates it at serialization: integers 400 through 599 only; omission defaults to 500. The finished response uses the concrete property `status`.

`statusCode` is an HTTP category, not application identity. Several codes can share one status.

### Diagnostics and enrichment

`requestId`, `metadata`, and `attributes` remain mutable so request and telemetry boundaries can add context after construction. They stay server-side during HTTP serialization.

`VercelError#toJSON()` is diagnostic serialization. It includes the developer message, stack, `public` details, metadata, attributes, and other defined enumerable fields; it excludes `cause`. Its output may contain sensitive data. Use `errorResponse()` for client-safe HTTP serialization.

## Error factories

`createErrors` creates a typed family with shared scope, documentation, metadata, attributes, reporting, or a custom class.

```ts
import { createErrors } from '@vercel/error';

type DatabaseCode = 'connection_failed' | 'pool_exhausted' | 'timeout';

const errors = createErrors<DatabaseCode>({
  scope: 'database',
  docsBaseUrl: 'https://example.com/internal/errors/database',
  attributes: { 'service.name': 'database-api' },
  onReport: (error) => {
    sentry.captureException(error);
  },
});
```

The factory always returns three methods:

| Method                      | Behavior                                               |
| --------------------------- | ------------------------------------------------------ |
| `create(message, options?)` | Create and return an error                             |
| `raise(message, options?)`  | Create and throw                                       |
| `report(message, options?)` | Create, call `onReport`, then return the same instance |

Without `onReport`, `report()` formats a sanitized terminal frame and passes that string to `console.error`. The default output omits raw stack inspection and enumerable diagnostics. `create()` and `raise()` never report, which leaves the operation boundary responsible for recording thrown errors once.

`onReport` receives the original error, is synchronous, and returns `undefined`. A synchronous callback exception propagates and replaces the error that `report()` would have returned. Async callbacks are rejected by TypeScript. The callback may expose PII or confidential developer prose; reporter integrations must allowlist or scrub data before transmission.

Factory and per-error `metadata` and `attributes` merge one level deep, with per-error keys winning. A per-error `link` also takes precedence over `docsBaseUrl`.

### Custom classes

Pass `ErrorClass` to infer a custom subtype:

```ts
import { VercelError, createErrors } from '@vercel/error';
import type { VercelErrorOptions } from '@vercel/error';

class DatabaseError extends VercelError<'pool_exhausted'> {
  readonly retryable = true;

  constructor(
    message: string,
    options: VercelErrorOptions<'pool_exhausted'> = {},
  ) {
    super(message, options);
    this.name = 'DatabaseError';
  }
}

const errors = createErrors({
  ErrorClass: DatabaseError,
  scope: 'database',
});

errors.create('Pool exhausted', { code: 'pool_exhausted' }).retryable;
```

A custom `TError` type argument requires its matching `ErrorClass`. Omitting `ErrorClass` always returns the base `VercelError<TCode>` type and instance.

## Formatting

`VercelError#toString()` delegates to `formatError(error, { format: 'auto' })`. Import `formatError` from `@vercel/error/format` when a caller needs an explicit preset.

| Preset  | Tree connectors | ANSI color | Reads ambient state |
| ------- | --------------- | ---------- | ------------------- |
| `auto`  | Detected        | Detected   | Yes                 |
| `plain` | No              | No         | No                  |
| `tree`  | Yes             | No         | No                  |
| `ansi`  | Yes             | Yes        | No                  |

`auto` checks `NO_COLOR`, then `FORCE_COLOR`, then TTY support. `NO_COLOR` selects tree output without ANSI; otherwise, `FORCE_COLOR` or TTY support selects ANSI tree output. All other environments use plain output. Explicit presets are deterministic; `ansi` produces ANSI output even when the server is not a TTY.

```ts
import { formatError } from '@vercel/error/format';

const text = formatError(error, { format: 'plain' });
```

Formatted output follows this structure:

```text
error: VercelError [database:pool_exhausted] Database pool exhausted
│
├── All connections are in use.
├─▸ hint: Inspect connection checkout duration.
├─▸ fix: Release leaked connections.
╰─▸ read more: https://example.com/internal/database/pool-exhausted
```

### Custom frames

`hint`, `fix`, and `link` return structured `FrameSection` values. `frame` uses those tokens to select labels, connectors, and color. A raw string such as `hint: text` remains an ordinary detail; the renderer does not parse prefixes to infer meaning.

```ts
import { fix, frame, hint, link } from '@vercel/error/format';

const output = frame(
  'Build failed: missing entry point',
  [
    'No index.ts or index.js was found.',
    hint('Check the configured source directory.'),
    fix('Create src/index.ts or update the package entry.'),
    link('https://vercel.com/docs/builds'),
  ],
  { format: 'tree' },
);
```

All caller-controlled text is sanitized. CRLF becomes LF, bare carriage returns are removed, and every extra line of multiline input is prefixed by the frame's own connector or indentation, so input text can't fake a frame line. Tabs, blank lines, and multiline content remain readable.

## HTTP responses

`errorResponse` returns a framework-neutral `ErrorResponse` with `{ status, body, headers }`:

```ts
import { errorResponse } from '@vercel/error/server';

const result = errorResponse(error);
return new Response(result.body, result);
```

`errorResponse()` throws `TypeError` on a plain `Error` rather than guessing its message is safe to publish. Wrap it instead: `new VercelError('…', { cause: err, public: { message: '…' } })`.

The JSON body uses the same `{ "error": { "code", "message", … } }` envelope as the Vercel REST API, not RFC 9457 problem details. If a consumer needs `application/problem+json`, map `code` (with `link`) to `type`, `message` to `detail`, and the remaining fields to extension members.

JSON is the default body. To let the request choose between JSON and ANSI text, pass the request:

```ts
const result = errorResponse(error, {
  request,
  onSerialize: (source, context) => {
    recordSerialization(source, context);
  },
});
```

`request` accepts a `Request` or `HeadersLike`. A present `X-Error-Format` header is authoritative; only the exact value `ansi` selects ANSI. Otherwise, an exact `text/plain+ansi` media range with a valid positive `q` value selects ANSI; an omitted `q` means `1`, and media type and `q` names are case-insensitive. Duplicate exact ranges use the highest valid quality. If exact ranges have only zero or invalid weights, JSON wins and the User-Agent fallback is skipped. If the exact range is absent, the existing case-sensitive `curl/` marker selects ANSI. Wildcards do not select ANSI. Headers choose the body format; they do not authenticate or authorize the caller.

JSON responses use `Content-Type: application/json`. ANSI responses use `Content-Type: text/plain+ansi; charset=utf-8`. When `request` is supplied, either response includes `Vary: X-Error-Format, Accept, User-Agent`; without it, `Vary` is omitted. JSON and negotiated ANSI text render the same normalized `public` details. ANSI negotiation never exposes the developer `message`, `reason`, `hint`, `fix`, or `link`.

`onSerialize` receives the original source plus `{ status, bodyFormat }` after the complete result has been built. `bodyFormat` reports whether the serialized body is `json` or `ansi`. The callback is synchronous and returns `undefined`. Cross-realm metadata and attributes remain `unknown`; validate them or use `instanceof VercelError` before relying on the typed local fields. Callback exceptions propagate and replace the response the caller would have received.

### Explicit public input

Untagged input must place approved prose under `public`:

```ts
const result = errorResponse({
  scope: 'api',
  code: 'rate_limited',
  statusCode: 429,
  public: {
    message: 'Too many requests.',
    hint: 'Wait before retrying.',
  },
});
```

The input uses `statusCode`; the result uses `status`. A top-level `message` on an untagged object is rejected because it is not an explicit disclosure decision.

### Response data

```ts
interface ErrorResponseData {
  readonly error: {
    readonly scope?: string;
    readonly code?: string;
    readonly message: string;
    readonly reason?: string;
    readonly hint?: string;
    readonly fix?: string;
    readonly link?: string;
  };
}
```

`ErrorResponseData` and both serialized body formats exclude `requestId`, metadata, attributes, cause, stack, developer name, and status. Use the actual HTTP response status as the source of truth. `ErrorResponseData` is the client-safe shape for JSON and message channels, not a full diagnostic transport. Parsing validates its fields, not its producer.

The completed server result is:

```ts
interface ErrorResponse {
  readonly status: number;
  readonly body: string;
  readonly headers: Record<string, string>;
}
```

## Consuming responses

`fromHttpResponse()` consumes a Web `Response` when it has an error status, an `application/json` content type, and valid `ErrorResponseData`. It derives `statusCode` from the response and reads `x-vercel-id` into `requestId` by default.

```ts
import { fromHttpResponse } from '@vercel/error/client';

const response = await fetch(url);
if (!response.ok) {
  const failedFetch = new Error(`${response.url} returned ${response.status}`);
  const error = await fromHttpResponse(response, { cause: failedFetch });

  sentry.captureException(error ?? failedFetch);
  throw error ?? failedFetch;
}
```

An explicit `requestId` overrides the response header. Set `requestIdHeader` to another header name for an application-owned correlation ID, or to `false` to skip header lookup. [`x-vercel-id`](https://vercel.com/docs/headers/response-headers#x-vercel-id) is Vercel routing context, not a promise that the value matches an application trace ID. For a cross-origin browser request, the server must include `x-vercel-id` in [`Access-Control-Expose-Headers`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers) before client code can read it.

The function returns `undefined` for a non-error status, a different content type, malformed JSON, or invalid response data. It does not report the error or create a fallback. It consumes the body after status and content type match; clone the response first if another caller also needs the body.

Use `parseErrorResponseData()` and `fromErrorResponseData()` when the input is already decoded or came through another serialization channel:

```ts
import {
  fromErrorResponseData,
  parseErrorResponseData,
} from '@vercel/error/client';

const data = parseErrorResponseData(value);
if (data) throw fromErrorResponseData(data, { statusCode: 502 });
```

Parsing requires a nonblank string message and nonblank `scope` or `code` when present. A present known field with the wrong type rejects the entire value; blank optional public details are omitted, nonblank text is preserved exactly, and unknown fields are ignored for additive evolution. Reconstruction copies response identity to `scope` and `code`, and response prose into both the developer fields and `public`. Parsing validates shape only. It does not tell you who sent the response. Verify the producer, review each field before showing it to a different recipient, and check permissions before acting on a `fix` or `link`.

## Recognition and utilities

All utilities below are exported from `@vercel/error`:

| Function                       | Behavior                                                                |
| ------------------------------ | ----------------------------------------------------------------------- |
| `isVercelError(value)`         | Recognize local instances or tagged data while the tag remains visible  |
| `isError(value)`               | Recognize standard errors across realms (iframes, workers, VM contexts) |
| `isErrorLike(value)`           | Recognize an object with a string `message`                             |
| `hasCode(error, codeOrCodes)`  | Narrow an error by one code or a readonly list                          |
| `getMessage(error, fallback?)` | Extract a message from an unknown value                                 |
| `getRootCause(error)`          | Follow `cause` to the root while stopping object cycles                 |

`isError` recognizes standard errors across realms. It uses `Error.isError` when available and falls back on older runtimes. `errorResponse()` applies separate disclosure checks, so fallback differences cannot expose developer details.

`isVercelError` recognizes local instances and tagged data while its symbol-keyed tag remains observable. The tag does not survive JSON, structured clone, `Worker`, or `MessagePort` transfer. Use `ErrorResponseData` for client-safe serialized data and an application-owned protocol for full diagnostics.

Tagged matches do not prove the producer is trusted. Their metadata and attributes remain `unknown`. Use `instanceof VercelError` before calling class methods or relying on typed local diagnostics.

## Bundle size

[Size Limit](https://github.com/ai/size-limit) measures the minified, Brotli-compressed bundle produced when only one runtime export is imported from the built package, including the code it depends on. CI enforces a separate budget for every runtime export.

> Regenerate with `pnpm size:readme`.

<!-- SIZE-TABLE:START -->

| Entry point or export    | Size (min+brotli) |
| ------------------------ | ----------------: |
| **@vercel/error**        |                   |
| `VercelError`            |           1.73 kB |
| `createErrors`           |           1.95 kB |
| `isVercelError`          |           1.88 kB |
| `isError`                |             108 B |
| `isErrorLike`            |              85 B |
| `hasCode`                |             120 B |
| `getMessage`             |             187 B |
| `getRootCause`           |             139 B |
| **@vercel/error/client** |                   |
| `fromErrorResponseData`  |            1.8 kB |
| `fromHttpResponse`       |           2.09 kB |
| `parseErrorResponseData` |             373 B |
| **@vercel/error/server** |                   |
| `errorResponse`          |           2.91 kB |
| `wantsAnsi`              |             467 B |
| **@vercel/error/format** |                   |
| `formatError`            |            1.2 kB |
| `frame`                  |           1.06 kB |
| `hint`                   |              52 B |
| `fix`                    |              51 B |
| `link`                   |              51 B |

<!-- SIZE-TABLE:END -->
