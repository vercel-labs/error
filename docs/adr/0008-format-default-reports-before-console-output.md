# Format default reports before console output

## Context

Passing a `VercelError` directly to `console.error` invokes host error inspection and bypasses the package's terminal sanitizer.

## Decision

When no `onReport` callback is configured, render the error with `formatError` before writing it to `console.error`. A supplied callback still receives the original error. Terminal sanitization removes control sequences, not PII or confidential prose.

## Reason

Formatting the default output applies the package's terminal-safety rules. Applications that need the raw error can provide `onReport`.

## Consequences

Default reports no longer include raw stack inspection or enumerable diagnostics. Applications that need those values must provide `onReport` and apply their own privacy policy.
