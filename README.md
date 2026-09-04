# @vercel/error

Structured error primitives for humans and agents.

## Table of contents

- [Install](#install)
- [Agent skill](#agent-skill)
- [Entry points](#entry-points)
- [Philosophy](#philosophy)
- [Errors for agents](#errors-for-agents)
- [Quick start](#quick-start)
- [Error anatomy](#error-anatomy)
- [Error factories](#error-factories)
- [Terminal formatting](#terminal-formatting)
- [HTTP error responses](#http-error-responses)
- [Parsing error responses](#parsing-error-responses)
- [Error utilities](#error-utilities)
- [Subclassing](#subclassing)

## Install

```bash
pnpm add @vercel/error
```

## Agent skill

The optional `vercel-error` skill helps coding agents design, implement, migrate, and review structured errors with this package. Install it separately from the npm package:

```bash
npx skills add vercel-labs/error --skill vercel-error
```

Installing `@vercel/error` does not activate the skill. The npm package provides the runtime APIs; the skill provides the decision process for using them well.

The command requires Node 22.20 or later and installs the latest skill from this repository's default branch. The skill instructs agents to check the consumer's installed package version before recommending imports.

## Entry points

| Import                 | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `@vercel/error`        | Core: `VercelError`, `createErrors`, guards, extractors, types |
| `@vercel/error/server` | Server: `errorResponse`, `wantsAnsi`                           |
| `@vercel/error/client` | Client: `parseErrorResponse`, `fromErrorResponse`              |
| `@vercel/error/format` | Format primitives: `frame`, `hint`, `fix`, `link`              |

## Philosophy

A good error answers up to five questions:

1. **What** happened? → `message`
2. **Why** did it happen? → `reason`
3. **What** could help? → `hint`
4. **How** to fix it? → `fix`
5. **Where** to learn more? → `link`

The more questions you answer, the faster the person (or agent) on the other end can resolve the issue.

The rest follows from that:

- Errors are a unit of communication between services, not crash artifacts. They carry context for humans, agents, and observability tools.
- Errors should be useful wherever they surface — terminal, log aggregator, HTTP response. The format adapts to the context.
- Errors are too fundamental to be locked to a framework or runtime.

## Errors for agents

An agentic error is a recovery protocol, not just a message:

```text
identify -> understand -> choose an action -> execute or escalate
```

The fields in a `VercelError` support each step:

| Agent need                        | Fields                                         |
| --------------------------------- | ---------------------------------------------- |
| Identify the failure reliably     | `scope`, `code`                                |
| Understand what happened and why  | `message`, `reason`                            |
| Choose a useful next step         | `hint`, `fix`, `link`                          |
| Correlate and investigate         | `requestId`, `cause`, `metadata`, `attributes` |
| Communicate safely to an end user | `userMessage`                                  |

Machines should branch on `code` or another structured contract. Humans and agents can read the same error through `toString()` or a custom `frame()`, but rendered text is a presentation format, not a protocol to parse.

Recovery fields propose actions; they do not authorize them. Parsing an error validates its shape, not its provenance. Verify the source and local policy before executing a `fix` or following a `link` received from another service.

Keep that structure across service boundaries: produce `ErrorResponse` JSON with `errorResponse`, validate unknown responses with `parseErrorResponse`, and reconstruct them with `fromErrorResponse`. Status, scope, causes, request IDs, metadata, and attributes are not part of the wire object, so the receiving application must preserve or add the context it owns.

## Quick start

```ts
import { VercelError } from '@vercel/error';

throw new VercelError('Database connection pool exhausted', {
  code: 'pool_exhausted',
  scope: 'database',
  statusCode: 503,
  reason: 'All 20 connections are in use and none have been released.',
  hint: 'Consider using pgBouncer for connection pooling.',
  fix: 'Increase max_connections or add pgBouncer.',
  link: 'https://vercel.com/docs/storage/neon#connection-pooling',
});
```

`toString()` auto-detects your environment and renders structured output. In a color-capable terminal (TTY or `FORCE_COLOR`), you get ANSI colors and Unicode tree connectors:

```
error: VercelError [database:pool_exhausted] Database connection pool exhausted
│
├── All 20 connections are in use and none have been released.
├─▸ hint: Consider using pgBouncer for connection pooling.
├─▸ fix: Increase max_connections or add pgBouncer.
╰─▸ read more: https://vercel.com/docs/storage/neon#connection-pooling
```

In piped or browser environments, the output falls back to plain indented text. See [Terminal formatting](#terminal-formatting) for the full detection logic.

For services that create many errors with shared context, see [Error factories](#error-factories).

## Error anatomy

Every `VercelError` field falls into one of three groups.

### Identity

| Field        | Type                | Description                                                                                             |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `code`       | `string` (readonly) | Machine-readable error code, e.g. `"pool_exhausted"`                                                    |
| `scope`      | `string` (readonly) | Namespace or service that produced the error, e.g. `"database"`                                         |
| `statusCode` | `number`            | HTTP status code. `errorResponse` uses this to set the response status (falls back to `500` when unset) |

### Context

| Field         | Type     | Description                                                                                                                                                 |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`     | `string` | What happened. The first constructor argument                                                                                                               |
| `reason`      | `string` | Why it happened. Explains the root cause                                                                                                                    |
| `hint`        | `string` | What could help. Advisory information for the developer                                                                                                     |
| `fix`         | `string` | How to fix it. An actionable remediation step                                                                                                               |
| `link`        | `string` | Where to learn more. A URL to relevant documentation                                                                                                        |
| `userMessage` | `string` | Client-safe message. Set this when `message` contains internal details you don't want in JSON. `errorResponse` uses it instead of `message` for JSON output |

### Observability

| Field        | Type                                                 | Description                                                                                                                     |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`   | `Record<string, SerializableValue>`                  | Structured context for debugging and logging. Supports arbitrary nesting. Server-side only — excluded from HTTP error responses |
| `attributes` | `Record<string, string \| number \| boolean \| ...>` | Flat key-value pairs for OpenTelemetry spans, Sentry tags, and metrics dashboards                                               |
| `requestId`  | `string`                                             | Correlation ID for tracing an error across services                                                                             |
| `cause`      | `unknown`                                            | Standard Error `cause` for chaining. Passed through to `super()` and walkable via `getRootCause`                                |

## Error factories

`createErrors` defines a scoped error namespace for a service or module. Every error created through the factory gets the scope injected automatically. The `report` callback defaults to `console.error` when not provided.

```ts
import { createErrors } from '@vercel/error';

const errors = createErrors({
  scope: 'database',
  report: (error) => sentry.captureException(error),
});
```

The factory returns three methods:

| Method                      | Behavior                                    |
| --------------------------- | ------------------------------------------- |
| `create(message, options?)` | Create and return a `VercelError`           |
| `raise(message, options?)`  | Create and throw (return type: `never`)     |
| `report(message, options?)` | Create, report via the callback, and return |

```ts
errors.create('Connection failed', { code: 'conn_failed' });
errors.raise('Timeout', { code: 'timeout' }); // throws
errors.report('Pool exhausted', { code: 'pool_exhausted' }); // reports + returns
```

### Factory-level attributes and metadata

Set attributes and metadata at the factory level. These merge with per-error values automatically, so every error gets baseline context without repetition.

```ts
const errors = createErrors({
  scope: 'billing',
  attributes: { 'service.name': 'billing-api' },
  metadata: { region: 'us-east-1' },
});

errors.create('Charge failed', {
  code: 'charge_failed',
  attributes: { 'stripe.error': 'card_declined' },
  metadata: { customerId: 'cus_123' },
});
// attributes: { 'service.name': 'billing-api', 'stripe.error': 'card_declined' }
// metadata: { region: 'us-east-1', customerId: 'cus_123' }
```

### Custom error classes

Pass `ErrorClass` to create instances of a custom subclass. Type inference flows through, so `create`, `raise`, and `report` all return your subclass type.

```ts
import { VercelError, createErrors } from '@vercel/error';
import type { VercelErrorOptions } from '@vercel/error';

class DatabaseError extends VercelError {
  readonly retryable = true;

  constructor(message: string, options?: VercelErrorOptions) {
    super(message, options);
    this.name = 'DatabaseError';
  }
}

const errors = createErrors({
  scope: 'database',
  ErrorClass: DatabaseError,
});

const err = errors.create('Pool exhausted');
err.retryable; // true, fully typed as DatabaseError
```

## Terminal formatting

`VercelError.toString()` auto-detects your environment and renders structured output with zero configuration.

### Auto-detection

The formatter checks the environment in order and uses the first match:

| Environment               | Tree structure | ANSI color | Example                        |
| ------------------------- | -------------- | ---------- | ------------------------------ |
| `NO_COLOR` env var set    | Yes            | No         | `NO_COLOR=1 node app.js`       |
| `FORCE_COLOR` env var set | Yes            | Yes        | `FORCE_COLOR=1 node app.js`    |
| TTY terminal              | Yes            | Yes        | Running directly in a terminal |
| Piped, CI, non-TTY        | No             | No         | `node app.js \| cat`           |
| Browser                   | No             | No         | `window` is defined            |

`NO_COLOR` respects the [no-color.org](https://no-color.org) convention. You still get Unicode tree characters for structure, but no escape codes. `FORCE_COLOR` forces full ANSI output even without a TTY, which is useful in Docker containers or CI systems that support color.

### Color hierarchy

When ANSI color is active, each element has a distinct visual treatment:

| Element                                 | Color     | Weight               |
| --------------------------------------- | --------- | -------------------- |
| `error:` label                          | Red       | Bold                 |
| Error name and `[scope:code]` qualifier | Red       | Normal               |
| Error message                           | Red       | Bold                 |
| `hint:` prefix                          | Yellow    | Bold                 |
| `fix:` prefix                           | Green     | Bold                 |
| `read more:` prefix                     | Inherited | Bold, URL underlined |
| `reason` text                           | Inherited | Normal               |
| Connectors (`├──`, `│`)                 | Inherited | Dim                  |

### Connector types

The tree uses arrow connectors (`├─▸`) for actionable items (`hint`, `fix`, `link`) and line connectors (`├──`) for informational items (`reason`).

### Plain text fallback

When tree structure is disabled (piped output, browser), sections are indented with two spaces:

```
error: VercelError [database:pool_exhausted] Database connection pool exhausted
  All 20 connections are in use and none have been released.
  hint: Consider using pgBouncer for connection pooling.
  fix: Increase max_connections or add pgBouncer.
  read more: https://vercel.com/docs/storage/neon#connection-pooling
```

### Format primitives

The `@vercel/error/format` entry point exports functions for building custom formatted output outside of `VercelError`. Use these when formatting errors you don't own or building custom CLI output.

```ts
import { frame, hint, fix, link } from '@vercel/error/format';

const output = frame('Build failed: missing entry point', [
  'No index.ts or index.js found in the src/ directory.',
  hint('Check your tsconfig.json paths configuration.'),
  fix('Create src/index.ts or update the "main" field in package.json.'),
  link('https://vercel.com/docs/builds#entry-points'),
]);

console.error(output);
```

All format functions are nil-safe: pass `undefined` or `null` and they return `undefined`, which `frame` filters out. `frame` auto-detects formatting the same way `VercelError.toString()` does.

## HTTP error responses

`errorResponse` builds a complete HTTP error response with content negotiation. It returns `{ status, body, headers }` for use with any framework.

```ts
import { errorResponse } from '@vercel/error/server';

const { status, body, headers } = errorResponse(error);
return new Response(body, { status, headers });
```

### Content negotiation

Pass a `Request` or `HeadersLike` object as the second argument to enable content negotiation. The response body switches from JSON to structured ANSI text when the client signals a preference:

```ts
const { status, body, headers } = errorResponse(error, request);
return new Response(body, { status, headers });
```

Clients signal ANSI preference in three ways (checked in order):

| Signal                           | Example                          |
| -------------------------------- | -------------------------------- |
| `X-Error-Format: ansi` header    | `curl -H "X-Error-Format: ansi"` |
| `Accept: text/plain+ansi` header | Custom client header             |
| `User-Agent` containing `curl/`  | Auto-detected for curl users     |

Without a signal (or without a request object), the response is always JSON.

### Plain parameters

You can pass plain parameters instead of a `VercelError` instance.

```ts
import { errorResponse } from '@vercel/error/server';

const { status, body, headers } = errorResponse({
  status: 429,
  code: 'rate_limited',
  message: 'Too many requests',
  hint: 'Wait 60 seconds before retrying.',
});

return new Response(body, { status, headers });
```

### Wire format

The JSON response body follows a canonical shape:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests",
    "reason": "You exceeded 100 requests per minute.",
    "hint": "Wait 60 seconds before retrying.",
    "fix": "Implement exponential backoff in your client.",
    "link": "https://vercel.com/docs/limits#rate-limits"
  }
}
```

All fields except `message` are optional. For JSON output from a `VercelError`, `userMessage` is used for `message`, falling back to `error.message` when `userMessage` isn't set.

When content negotiation selects ANSI text, `errorResponse` renders a `VercelError` through `toString()`. That output contains the developer-facing `message` and any reason, hint, fix, or link instead of substituting `userMessage`. Negotiation headers express a format preference, not trust. Authenticate and authorize the caller before passing its request to `errorResponse` when those fields contain private diagnostics. Otherwise omit the request to disable ANSI negotiation, set a client-safe `userMessage`, and keep every JSON-visible reason, hint, fix, and link client-safe too.

### Manual ANSI detection

Use `wantsAnsi` directly when you need to check ANSI preference outside of `errorResponse`:

```ts
import { wantsAnsi } from '@vercel/error/server';

if (wantsAnsi(request)) {
  // render ANSI-formatted output
}
```

Accepts a `Request`, any `HeadersLike` object, or `null`/`undefined`.

## Parsing error responses

### Validate unknown JSON

`parseErrorResponse` validates that unknown data matches the `ErrorResponse` shape. Returns the validated response or `undefined` if invalid.

```ts
import { parseErrorResponse } from '@vercel/error/client';

const res = await fetch('/api/deploy');
if (!res.ok) {
  const parsed = parseErrorResponse(await res.json());
  if (parsed) {
    console.log(parsed.error.code, parsed.error.message);
  }
}
```

### Reconstruct a VercelError

`fromErrorResponse` reconstructs a `VercelError` from a validated `ErrorResponse`. Use this at service boundaries when you want to re-throw, enrich, or chain an upstream error.

```ts
import { parseErrorResponse, fromErrorResponse } from '@vercel/error/client';

const res = await fetch('https://api.vercel.com/v1/deployments');
if (!res.ok) {
  const parsed = parseErrorResponse(await res.json());
  if (parsed) {
    throw fromErrorResponse(parsed, {
      statusCode: res.status,
      scope: 'upstream',
      cause: new Error(`${res.url} returned ${res.status}`),
    });
  }
}
```

The response `message` becomes both the VercelError `message` and `userMessage`, since it was already client-safe on the wire.

## Error utilities

Guards and extractors for working with errors from any source. All exported from `@vercel/error`.

| Function                       | Description                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `isVercelError(value)`         | Type guard for `VercelError`. Uses `instanceof` with a `Symbol.for` fallback for cross-realm detection     |
| `isError(value)`               | Type guard for `Error`. Handles cross-realm errors via prototype walking                                   |
| `isErrorLike(value)`           | Type guard for objects with a `message` string property                                                    |
| `hasCode(error, code)`         | Check if an error has a specific `code`. Also accepts an array of codes                                    |
| `getMessage(error, fallback?)` | Extract a message from any value. Returns `undefined` when no message is found and no fallback is provided |
| `getRootCause(error)`          | Walk the `cause` chain to the root. Handles cycles via `WeakSet`                                           |

## Subclassing

`VercelError` is designed for subclassing. The [Custom error classes](#custom-error-classes) section above shows how to use subclasses with `createErrors` — this section covers the general pattern.

Two things to keep in mind:

1. **Hardcode `this.name`** in your constructor. Bundler minification turns class names into single letters, which breaks Sentry grouping and log readability. String literals are minification-safe.

2. **Accept `VercelErrorOptions`** as the options type so your subclass stays compatible with `createErrors`.

```ts
import { VercelError } from '@vercel/error';
import type { VercelErrorOptions } from '@vercel/error';

class NetworkError extends VercelError {
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: VercelErrorOptions & { retryable?: boolean },
  ) {
    super(message, options);
    this.name = 'NetworkError';
    this.retryable = options?.retryable ?? false;
  }
}

const error = new NetworkError('Connection refused', {
  code: 'conn_refused',
  retryable: true,
});

error.name; // 'NetworkError' (stable across minification)
error.retryable; // true
error.toString(); // uses NetworkError in the header
```
