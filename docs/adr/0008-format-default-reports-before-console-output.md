# Format default reports before console output

## Context

Passing a `VercelError` directly to `console.error` lets the host inspect its raw stack and fields without using the package's terminal sanitizer.

## Decision

When no `onReport` callback is configured, render the error with `formatError` before writing it to `console.error`. A supplied callback still receives the original error. Terminal sanitization removes control sequences, not PII or confidential prose.

## Reason

The default output should use the same terminal-safety rules as the package formatter. Raw reporting remains available through an explicit application-owned callback.

## Consequences

Default reports no longer include raw stack inspection or enumerable diagnostics. Applications that need those values must provide `onReport` and apply their own privacy policy.
