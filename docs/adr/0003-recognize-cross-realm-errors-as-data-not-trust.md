# Recognize cross-realm errors as data, not trust

## Context

`VercelError` values can cross package and realm seams where `instanceof` alone is insufficient. A stable symbol supports recognition across those seams, but any producer can forge it.

## Decision

Use `instanceof` for local `VercelError` instances. As a cross-realm fallback, require the namespaced symbol and validate the data shape. Treat a successful `isVercelError` check as permission to read `VercelErrorLike` fields, not as authentication, disclosure approval, or proof that local methods are safe.

At the HTTP seam, shape-validate tagged values before projection. Reject malformed tagged values before considering flat public input. Only the current package-namespaced tag carries meaning; any other symbol is invisible to classification.

## Reason

The combined check preserves cross-realm interoperability without turning a forgeable marker into a trust decision. Revalidation at the disclosure seam prevents developer text from being reinterpreted as approved public prose.

## Consequences

Callers use `instanceof VercelError` before invoking class or subclass methods. Security decisions require application-owned authentication and authorization beyond this data guard.
