# @vercel/error

Errors with two audiences: developers get the full story (cause, reason, hint, fix, metadata), and clients get only the `public` message you explicitly approved. `errorResponse()` turns any error into an HTTP response that never leaks internal details, and `formatError()` renders errors as readable terminal frames. Framework-neutral, with zero runtime dependencies.

## Install

```bash
pnpm add @vercel/error
```

The optional `vercel-error` skill helps coding agents choose fields, migrate existing errors, and review which details reach clients:

```bash
npx skills add vercel-labs/error --skill vercel-error
```

Installing the npm package does not activate the skill.

## Quick start

```ts
import { VercelError } from '@vercel/error';

try {
  await checkoutConnection(shard);
} catch (cause) {
  throw new VercelError('Database shard 7 exhausted its connection pool', {
    cause,
    code: 'pool_exhausted',
    scope: 'database',
    statusCode: 503,
    reason: 'All 20 connections are in use.',
    hint: 'Inspect connection checkout duration.',
    fix: 'Release leaked connections or increase pool capacity.',
    link: 'https://example.com/internal/database/pool-exhausted',
    public: {
      message: 'The service is temporarily unavailable.',
      fix: 'Try again shortly.',
      link: 'https://status.example.com',
    },
    metadata: { shard: 7, poolSize: 20 },
    attributes: { 'db.system': 'postgresql' },
  });
}
```

Everything outside `public` is developer-facing and stays out of HTTP responses. Serialize with `errorResponse()`; `JSON.stringify(error)` includes developer text and stack.

## Entry points

| Import                 | Exports                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@vercel/error`        | `VercelError`, `createErrors`, guards, extractors, shared types                                            |
| `@vercel/error/client` | `parseErrorResponse`, `fromErrorResponse`, `ErrorResponseData`, `FromErrorResponseOptions`                 |
| `@vercel/error/server` | `errorResponse`, `wantsAnsi`, `ErrorResponseInput`, `ErrorResponse`, `ErrorResponseOptions`, `HeadersLike` |
| `@vercel/error/format` | `formatError`, `frame`, `hint`, `fix`, `link`, format and section types                                    |

## Error contract

### Identity

`scope` and `code` form stable machine identity. Software should branch on these fields, never on rendered prose. The same rule applies to parsed responses on the client (see Consuming responses).

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

`public` is the only prose from a `VercelError` that `errorResponse()` sends to a client. If it is present, `public.message` is required and must be nonblank; the constructor validates this and throws `TypeError` for invalid details. It also copies and freezes `public` and drops unknown fields, so mutating the object you passed in later cannot change the approved copy.

```ts
interface PublicErrorDetails {
  readonly message: string;
  readonly reason?: string;
  readonly hint?: string;
  readonly fix?: string;
  readonly link?: string;
}
```

When `public` is absent, `errorResponse()` uses the fixed message `An error occurred.`. It never falls back to developer prose. `docsBaseUrl` derives only the developer `link`; a public link must be set explicitly under `public.link`.

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

Without `onReport`, `report()` calls `console.error`. `create()` and `raise()` never invoke the callback, which leaves the operation boundary responsible for recording thrown errors once.

`onReport` is synchronous and returns `undefined`. A synchronous callback exception propagates and replaces the error that `report()` would have returned. Async callbacks are rejected by TypeScript.

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

`request` accepts a `Request` or `HeadersLike`. A present `X-Error-Format` header is authoritative; only `ansi` selects ANSI. Without that header, `Accept: text/plain+ansi` or a `curl/` user agent selects ANSI, in that order. Headers choose the body format; they do not authenticate or authorize the caller.

JSON and negotiated ANSI text render the same `public` details. ANSI negotiation never exposes the developer `message`, `reason`, `hint`, `fix`, or `link`.

`onSerialize` receives the original source plus `{ status, bodyFormat }` after the complete result has been built. `bodyFormat` reports whether the serialized body is `json` or `ansi`. The callback is synchronous and returns `undefined`. Server-side instrumentation can inspect metadata and attributes, but they're only as trustworthy as wherever the error came from; recognition doesn't verify the producer. Callback exceptions propagate and replace the response the caller would have received.

### Plain public input

Use flat params when every supplied field is already public:

```ts
const result = errorResponse({
  scope: 'api',
  code: 'rate_limited',
  statusCode: 429,
  message: 'Too many requests.',
  hint: 'Wait before retrying.',
});
```

The input uses `statusCode`; the result uses `status`.

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

`ErrorResponseData` and both serialized body formats exclude `requestId`, metadata, attributes, cause, stack, developer name, and status. Use the actual HTTP response status as the source of truth.

The completed server result is:

```ts
interface ErrorResponse {
  readonly status: number;
  readonly body: string;
  readonly headers: Record<string, string>;
}
```

## Consuming responses

`parseErrorResponse()` validates unknown JSON. It requires a nonblank string message. A present known field with the wrong type rejects the entire response; unknown fields are ignored so producers can add fields later.

```ts
import { fromErrorResponse, parseErrorResponse } from '@vercel/error/client';

const response = await fetch(url);
if (!response.ok) {
  const failedFetch = new Error(`${response.url} returned ${response.status}`);
  const parsed = parseErrorResponse(
    await response.json().catch(() => undefined),
  );

  if (!parsed) throw failedFetch;

  throw fromErrorResponse(parsed, {
    cause: failedFetch,
    requestId: response.headers.get('x-request-id') ?? undefined,
    statusCode: response.status,
  });
}
```

`fromErrorResponse()` copies response identity to `scope` and `code`, and copies response prose into the reconstructed developer fields and `public`. Passing the reconstructed error to `errorResponse()` therefore sends that identity and prose again. The caller supplies status, cause, request ID, metadata, and attributes. Parsing validates shape only. It does not tell you who sent the response. Verify the producer, review each field before showing it to a different recipient, and check permissions before acting on a `fix` or `link`.

## Recognition and utilities

All utilities below are exported from `@vercel/error`:

| Function                       | Behavior                                                                |
| ------------------------------ | ----------------------------------------------------------------------- |
| `isVercelError(value)`         | Recognize local instances or tagged cross-realm data                    |
| `isError(value)`               | Recognize standard errors across realms (iframes, workers, VM contexts) |
| `isErrorLike(value)`           | Recognize an object with a string `message`                             |
| `hasCode(error, codeOrCodes)`  | Narrow an error by one code or a readonly list                          |
| `getMessage(error, fallback?)` | Extract a message from an unknown value                                 |
| `getRootCause(error)`          | Follow `cause` to the root while stopping object cycles                 |

`isError` recognizes standard errors across realms. It uses `Error.isError` when available and falls back on older runtimes. `errorResponse()` applies separate disclosure checks, so fallback differences cannot expose developer details.

`isVercelError` recognizes local instances and tagged cross-realm data. Cross-realm matches are data-only and do not prove the producer is trusted. Use `instanceof VercelError` before calling class or subclass methods.

## Bundle size

[Size Limit](https://github.com/ai/size-limit) measures the minified, Brotli-compressed bundle produced when only one runtime export is imported from the built package, including the code it depends on. CI enforces a separate budget for every runtime export.

> Regenerate with `pnpm size:readme`.

<!-- SIZE-TABLE:START -->

| Entry point or export    | Size (min+brotli) |
| ------------------------ | ----------------: |
| **@vercel/error**        |                   |
| `VercelError`            |           1.69 kB |
| `createErrors`           |           1.91 kB |
| `isVercelError`          |           1.85 kB |
| `isError`                |             108 B |
| `isErrorLike`            |              85 B |
| `hasCode`                |             111 B |
| `getMessage`             |             186 B |
| `getRootCause`           |             145 B |
| **@vercel/error/client** |                   |
| `fromErrorResponse`      |           1.76 kB |
| `parseErrorResponse`     |             245 B |
| **@vercel/error/server** |                   |
| `errorResponse`          |           2.44 kB |
| `wantsAnsi`              |             153 B |
| **@vercel/error/format** |                   |
| `formatError`            |            1.2 kB |
| `frame`                  |           1.06 kB |
| `hint`                   |              52 B |
| `fix`                    |              51 B |
| `link`                   |              51 B |

<!-- SIZE-TABLE:END -->
