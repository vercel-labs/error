# @vercel/error

Use native `Error` for local failures. Use `@vercel/error` when callers need stable codes, clients need approved text, or readers need recovery advice.

The package separates `scope` and `code` from developer details and `public` text approved for the recipient. It also formats terminal output and has no runtime dependencies.

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
    const error = new VercelError('Database connection checkout failed', {
      cause,
      code: 'checkout_failed',
      scope: 'database',
      statusCode: 500,
      public: {
        message: 'We could not complete the request.',
      },
    });
    const result = errorResponse(error);
    return new Response(result.body, result);
  }
}
```

`cause` keeps the original failure. The constructor message is for developers. Only `public` supplies the response message. `scope` and `code` also reach the client, and `statusCode` becomes the HTTP status.

Read the [project narrative](https://github.com/vercel-labs/error/blob/main/docs/narrative.md) for the problem, alternatives, and adoption path.

## Agent guidance

The optional vercel-error skill helps coding agents choose fields, migrate existing errors, and review which details reach clients:

```bash
npx skills add vercel-labs/error --skill vercel-error
```

Installing the npm package does not activate the skill.

## Entry points

| Import                 | Exports                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vercel/error`        | `VercelError`, `createErrors`, guards, extractors, shared types                                                                                                                     |
| `@vercel/error/client` | `fromHttpResponse`, `parseErrorResponseData`, `fromErrorResponseData`, `ErrorResponseData`, and option types                                                                        |
| `@vercel/error/server` | `buildErrorResponseData`, `errorResponse`, `wantsAnsi`, `ErrorResponseDataInput`, `ErrorResponseData`, `ErrorResponseInput`, `ErrorResponse`, `ErrorResponseOptions`, `HeadersLike` |
| `@vercel/error/format` | `formatError`, `frame`, `hint`, `fix`, `link`, format and section types                                                                                                             |

## Error contract

### Identity

`scope` and `code` identify an error for software. When set, each must contain more than whitespace. Validation preserves the original text, including any surrounding spaces.

Branch on these fields, not on messages or terminal output. The same rule applies to [parsed responses](#consuming-responses).

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

### Recipient-facing details (`public`)

The data builder and `errorResponse()` use only `public` text from a `VercelError` as response prose. Its `message` must be nonblank. Optional `reason`, `hint`, `fix`, and `link` fields must be strings; blank values are omitted and other text is preserved.

The constructor throws `TypeError` for invalid details. It drops unknown fields and freezes a copy, so later input changes cannot alter the approved text.

```ts
interface PublicErrorDetails {
  readonly message: string;
  readonly reason?: string;
  readonly hint?: string;
  readonly fix?: string;
  readonly link?: string;
}
```

Without `public`, a `VercelError` or tagged value sends `An error occurred.` instead of developer text. Untagged input requires `public`. `docsBaseUrl` sets only the developer `link`; set `public.link` explicitly for clients. `scope`, `code`, and HTTP status still reach clients.

### Transport

`statusCode` is the HTTP status this error should get if it becomes an HTTP response. `errorResponse()` validates it at serialization: integers 400 through 599 only; omission defaults to 500. The finished response uses the concrete property `status`.

`statusCode` is an HTTP category, not application identity. Several codes can share one status.

### Diagnostics and enrichment

`requestId`, `metadata`, and `attributes` remain mutable so request and telemetry boundaries can add context after construction. They are excluded from response data and both HTTP body formats.

`VercelError#toJSON()` is diagnostic serialization. It includes the developer message, stack, `public` details, metadata, attributes, and other defined enumerable fields; it excludes `cause`. Its output may contain sensitive data. Use `buildErrorResponseData()` for client-safe data or `errorResponse()` for HTTP serialization. Logs need their own [disclosure policy](#allowlisted-logging).

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

Pass a whole error to a reporter only when its policy permits all included fields. For restricted logs, use the [allowlist recipe](#allowlisted-logging).

The factory always returns three methods:

| Method                      | Behavior                                               |
| --------------------------- | ------------------------------------------------------ |
| `create(message, options?)` | Create and return an error                             |
| `raise(message, options?)`  | Create and throw                                       |
| `report(message, options?)` | Create, call `onReport`, then return the same instance |

Without `onReport`, `report()` formats a sanitized terminal frame and passes that string to `console.error`. The default output omits raw stack inspection and enumerable diagnostics. `create()` and `raise()` never report, which leaves the operation boundary responsible for recording thrown errors once.

`onReport` receives the original error, is synchronous, and returns `undefined`. A synchronous callback exception propagates and replaces the error that `report()` would have returned. Async callbacks are rejected by TypeScript. The callback may expose PII or confidential developer prose; reporter integrations must allowlist or scrub data before transmission.

Factory and per-error `metadata` and `attributes` merge one level deep, with per-error keys winning. A per-error `link` also takes precedence over `docsBaseUrl`.

### Allowlisted logging

Use `onReport` to emit an application-defined log record. Keep each field and its accepted values explicit. A string or number type alone does not make provider data safe to log.

```ts
import { createErrors } from '@vercel/error';

const codes = [
  'unavailable',
  'configuration_failed',
  'unknown_failure',
] as const;
type RosterCode = (typeof codes)[number];

const rosterErrors = createErrors<RosterCode>({
  scope: 'roster',
  onReport(error) {
    const status = error.attributes?.['upstream.status'];
    const code =
      error.code !== undefined && codes.includes(error.code)
        ? error.code
        : 'unknown_failure';

    console.error('roster_failure', {
      scope: 'roster',
      code,
      ...(typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
        ? { upstreamStatus: status }
        : {}),
    });
  },
});

function reportRosterFailure(
  cause: unknown,
  code: RosterCode,
  upstreamStatus?: number,
) {
  return rosterErrors.report('Roster lookup failed', {
    code,
    cause,
    attributes: { 'upstream.status': upstreamStatus },
    public: { message: 'The roster could not be retrieved.' },
  });
}
```

The application classifies the provider failure before calling `reportRosterFailure`. With code `unavailable` and status `503`, the log event is `roster_failure` with these fields:

```json
{
  "scope": "roster",
  "code": "unavailable",
  "upstreamStatus": 503
}
```

The original caught value remains in `cause` for controlled diagnosis and is excluded from this log record.

- Select approved values in `onReport`. Do not spread `error`, `metadata`, or `attributes` into logs.
- `toJSON()` includes diagnostic data. Terminal sanitization removes control sequences, not confidential content. Neither establishes a log disclosure policy.
- `public` text is approved for the intended response recipient. Log retention and access need a separate decision.
- Report once at the operation that owns the final failure. `create` and `raise` do not report. `report` creates, reports, and returns the same error.
- `onReport` is synchronous and returns `undefined`. Its exceptions propagate; the callback owns how to handle a failing log sink.
- Store an upstream status as diagnostic context. Reserve `statusCode` for an authored HTTP response mapping.

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

`request` accepts a `Request` or `HeadersLike`. The headers choose the format in this order:

1. `X-Error-Format` wins when present. Only the exact value `ansi` selects ANSI; any other value selects JSON.
2. Otherwise, check exact `text/plain+ansi` entries in `Accept`. A valid `q > 0` selects ANSI; missing `q` counts as `1`. Media type and `q` names ignore case. Duplicates use the highest valid `q`.
3. Unsupported parameters, including a non-UTF-8 charset, cannot select ANSI. If exact entries exist but none qualifies, use JSON without checking `User-Agent`.
4. If no exact entry exists, a case-sensitive `curl/` in `User-Agent` selects ANSI. Wildcards do not select ANSI.

Headers choose a format; they do not authenticate the caller or authorize disclosure.

JSON uses `Content-Type: application/json`. ANSI uses `Content-Type: text/plain+ansi; charset=utf-8`. When you supply `request`, both include `Vary: X-Error-Format, Accept, User-Agent`. Without `request`, `Vary` is omitted.

Both formats use the same `public` details. ANSI never exposes the developer `message`, `reason`, `hint`, `fix`, or `link`.

`onSerialize` runs after the response is built. It receives the original source and `{ status, bodyFormat }`, where `bodyFormat` is `json` or `ansi`. The callback is synchronous, returns `undefined`, and propagates exceptions.

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

The input uses `statusCode`; the result uses `status`. A top-level `message` never substitutes for `public.message`.

The completed server result is:

```ts
interface ErrorResponse {
  readonly status: number;
  readonly body: string;
  readonly headers: Record<string, string>;
}
```

## Response data

Use `buildErrorResponseData()` for tool results and other message channels that need approved error data without HTTP status, headers, or format selection. The `server` entry works in browsers, workers, edge runtimes, and Node.

```ts
import { VercelError } from '@vercel/error';
import { buildErrorResponseData } from '@vercel/error/server';

const error = new VercelError('Roster provider request failed', {
  scope: 'roster',
  code: 'unavailable',
  public: {
    message: 'The roster is temporarily unavailable.',
    fix: 'Try again later.',
  },
});

const data = buildErrorResponseData(error);
const toolResult = { success: false, ...data };
```

The example defines a tool result shape; existing tools must update their schemas and consumers before adopting it. To keep an existing message field, use `data.error.message`.

The builder accepts a valid tagged error or explicit `ErrorResponseDataInput`. Both input and output types are exported from `@vercel/error/server`. `ErrorResponseInput` extends the data input with optional `statusCode` for HTTP callers.

```ts
import type { PublicErrorDetails } from '@vercel/error';

interface ErrorResponseDataInput {
  readonly scope?: string;
  readonly code?: string;
  readonly public: PublicErrorDetails;
}
```

Defined identity must be nonblank. `public.message` must be nonblank; optional public details must be strings. Blank optional details and unknown public fields are omitted, and other text is preserved. A tagged error without `public` gets `An error occurred.` while keeping its identity.

Non-object input, invalid identity or public details, malformed tagged data, plain `Error` objects, untagged objects with `name` or `stack`, and untagged input missing `public` throw `TypeError`. A top-level `message` never substitutes for `public.message`. The structural TypeScript signature cannot prove the runtime tag is present, so runtime validation still applies.

The builder returns fresh plain objects, writes nothing to the source, and leaves the output mutable. It does not report, perform I/O, negotiate a format, or call source methods. Getters and Proxy traps can run; their exceptions propagate.

It neither selects nor range-checks an HTTP status. Tagged validation still requires a numeric `statusCode` when defined. For example, data building accepts a tagged error with `statusCode: 200` and omits that field; `errorResponse()` rejects it.

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

`ErrorResponseData` and both serialized body formats exclude `requestId`, metadata, attributes, cause, stack, developer name, and status. When using HTTP, take status from the actual response. Approve identity and text for each recipient. The shape and forgeable tag do not authenticate the producer or authorize a recovery action.

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

Parsing requires a nonblank string `message`, plus nonblank `scope` and `code` when present. A wrong type in any known field rejects the data. Blank optional details are omitted; other text stays unchanged. Unknown fields are ignored so new fields can be added later.

`fromErrorResponseData()` copies parsed fields into a `VercelError`. Parsing does not verify who sent the data. Check the source before forwarding details, and check permissions before acting on a `fix` or `link`.

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
| `buildErrorResponseData` |           2.25 kB |
| `errorResponse`          |           2.94 kB |
| `wantsAnsi`              |             505 B |
| **@vercel/error/format** |                   |
| `formatError`            |            1.2 kB |
| `frame`                  |           1.06 kB |
| `hint`                   |              52 B |
| `fix`                    |              51 B |
| `link`                   |              51 B |

<!-- SIZE-TABLE:END -->
