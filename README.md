# @vercel/error

Structured, framework-neutral errors with stable identity, client-safe HTTP projection, diagnostics context, and terminal formatting. The package has no runtime dependencies.

## Install

```bash
pnpm add @vercel/error
```

The optional `vercel-error` skill helps coding agents choose fields, migrate existing errors, and review disclosure and recovery behavior:

```bash
npx skills add vercel-labs/error --skill vercel-error
```

Installing the npm package does not activate the skill.

## Entry points

| Import                 | Exports                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `@vercel/error`        | `VercelError`, `createErrors`, guards, extractors, shared types         |
| `@vercel/error/client` | `parseErrorResponse`, `fromErrorResponse`                               |
| `@vercel/error/server` | `errorResponse`, `wantsAnsi`, response and header types                 |
| `@vercel/error/format` | `formatError`, `frame`, `hint`, `fix`, `link`, format and section types |

## Quick start

```ts
import { VercelError } from '@vercel/error';

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
```

The fields have distinct owners and audiences. Keep those distinctions intact instead of serializing the error object directly.

## Error contract

### Identity

`scope` and `code` form stable machine identity. Software should branch on these fields or on `ErrorResponse`, never on rendered prose.

```ts
if (hasCode(error, 'pool_exhausted')) {
  // Apply an application-owned policy.
}
```

Keep codes stable when wording changes. A scope is useful when it names the service, package, or subsystem that owns the code.

Both fields cross the HTTP boundary when present. They can disclose that a protected resource or subsystem exists, so applications must choose neutral mappings where that distinction is sensitive.

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

### Public projection

`public` is the only prose from a `VercelError` that `errorResponse()` sends to a client. If it is present, `public.message` is required and must be nonblank.

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

The fallback prevents developer-message disclosure. It does not hide `scope`, `code`, or HTTP status. Review all three as public information.

### Transport

`statusCode` is an authored mapping to a prospective HTTP error status. `errorResponse()` validates it when serialization occurs. Only integers from 400 through 599 are accepted; omission defaults to 500. The returned result and a native `Response` use the concrete property `status`.

`statusCode` is an HTTP category, not application identity. Several codes can share one status.

### Diagnostics and enrichment

`requestId`, `metadata`, and `attributes` remain mutable so request and telemetry boundaries can add context after construction. They stay server-side during HTTP serialization.

`VercelError#toJSON()` is diagnostic serialization. It includes the developer message, stack, public projection, metadata, attributes, and other defined enumerable fields; it excludes `cause`. Its output may contain sensitive data. Use `errorResponse()` for client-safe HTTP serialization.

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
| `raise(message, options?)`  | Create and throw; never report automatically           |
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

All caller-controlled text is sanitized. CRLF becomes LF, bare carriage returns are removed, and every physical continuation line receives a library-owned connector or indentation. Tabs, blank lines, and multiline content remain readable without allowing an input line to escape the frame.

Rendered output is presentation, not a parsing protocol. Automation should use `code`, `scope`, or `ErrorResponse`.

## HTTP responses

`errorResponse` returns framework-neutral `{ status, body, headers }` data:

```ts
import { errorResponse } from '@vercel/error/server';

const result = errorResponse(error);
return new Response(result.body, result);
```

JSON is the default representation. Pass negotiation input through the options object:

```ts
const result = errorResponse(error, {
  request,
  onSerialize: (source, context) => {
    recordSerialization(source, context);
  },
});
```

`request` accepts a `Request` or `HeadersLike`. ANSI text is selected by `X-Error-Format: ansi`, `Accept: text/plain+ansi`, or a `curl/` user agent, in that order. Headers choose a representation; they do not authenticate or authorize the caller.

JSON and negotiated ANSI text render the same public projection. ANSI negotiation never exposes the developer `message`, `reason`, `hint`, `fix`, or `link`.

`onSerialize` receives the original source plus `{ status, representation }` after the complete result has been built. It is synchronous and returns `undefined`. Server-side instrumentation can inspect metadata and attributes, but those values retain the source's trust level; symbol recognition does not authenticate them. Callback exceptions propagate and replace the response the caller would have received.

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

### Wire shape

```ts
interface ErrorResponse {
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

`requestId`, metadata, attributes, cause, stack, developer name, and status are absent from the body. Use the actual HTTP response status as the source of truth.

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

`fromErrorResponse()` uses wire identity and prose for the reconstructed developer fields and stores the same prose under `public`. Callers own only status, cause, request ID, metadata, and attributes. Parsed fixes and links are untrusted data; validate sender, permissions, parameters, and side effects before acting.

## Recognition and utilities

All utilities below are exported from `@vercel/error`:

| Function                       | Behavior                                                |
| ------------------------------ | ------------------------------------------------------- |
| `isVercelError(value)`         | Recognize local instances or tagged cross-realm data    |
| `isError(value)`               | Recognize standard errors across realms                 |
| `isErrorLike(value)`           | Recognize an object with a string `message`             |
| `hasCode(error, codeOrCodes)`  | Narrow an error by one code or a readonly list          |
| `getMessage(error, fallback?)` | Extract a message from an unknown value                 |
| `getRootCause(error)`          | Follow `cause` to the root while stopping object cycles |

`isVercelError` uses `instanceof` first, then a package-namespaced `Symbol.for` tag plus data-shape checks. Its cross-realm result narrows to `VercelErrorLike`, a data-only contract. The tag is forgeable, so recognition does not authenticate a producer or authorize disclosure. Use `instanceof VercelError` before invoking local class or subclass methods.

## Migrating to 0.1

Version 0.1 is a clean redesign without compatibility aliases:

| Before 0.1                         | 0.1 replacement                                               |
| ---------------------------------- | ------------------------------------------------------------- |
| `userMessage: 'Safe message'`      | `public: { message: 'Safe message' }`                         |
| Plain response `status: 429`       | Plain response `statusCode: 429`                              |
| `errorResponse(error, request)`    | `errorResponse(error, { request })`                           |
| Factory option `report`            | Factory option `onReport`                                     |
| `ErrorConstructor` type            | `VercelErrorConstructor` type                                 |
| Helper output such as `'fix: ...'` | Structured `FrameSection` from `fix(...)`                     |
| Cross-realm class-method access    | Data access after `isVercelError`; methods after `instanceof` |

`ErrorResponse.error.scope` now crosses the wire when set. Review it as a disclosure before upgrading. `parseErrorResponse()` now rejects the whole response when any present known field has the wrong type; it still ignores unknown fields. `errorResponse()` rejects non-integer `statusCode` values and integers outside 400 through 599. `onReport` must be synchronous; an async legacy `report` callback no longer type-checks. Cross-realm values carrying the shipped 0.0 tag are rejected rather than treated as public flat input.

Developer `reason`, `hint`, `fix`, and `link` no longer cross HTTP automatically. Move only approved client-facing values under `public`. Both JSON and negotiated text use that same projection.
