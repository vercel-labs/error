# Recognize cross-realm errors as data, not trust

## Context

`VercelError` values can cross package boundaries and JavaScript realms, where `instanceof` alone does not recognize them. A stable symbol works across those boundaries, but any producer can forge it.

## Decision

Use `instanceof` for local `VercelError` instances. For values from another realm, require the package symbol and validate the fields. A successful `isVercelError` check only means the `VercelErrorLike` fields are safe to read. It does not authenticate the producer, approve disclosure, or make local methods safe to call.

Before building an HTTP response, validate the fields of a tagged value. Reject a malformed tagged value instead of treating it as flat public input. Only the current package symbol has meaning; ignore every other symbol during classification.

## Reason

The combined check recognizes errors across realms without treating a forgeable marker as proof of trust. Validating again before serialization prevents developer text from being mistaken for approved public text.

## Consequences

Callers must use `instanceof VercelError` before calling class or subclass methods. Applications must make authentication and authorization decisions separately from this data guard.
