# Degrade error recognition where the brand check is missing

## Context

The package is isomorphic: the same modules run in browsers, workers, edge runtimes, and Node, replacing utilities that already ship to client bundles. `Error.isError` gives precise, forgery-resistant cross-realm error recognition, but not every supported runtime provides it, and a guard that throws where the builtin is missing would make the package unusable there.

## Decision

Capture `Error.isError` at module load and use it wherever the runtime provides it. Where it is missing, fall back to `instanceof` plus `Object.prototype.toString` branding on the value itself; an exception thrown by a trap or getter during those checks classifies the value as not an error. Never let client-safe serialization depend on recognition precision: the HTTP seam independently rejects any untagged value carrying `name` or `stack`.

## Reason

The brand check is strictly better where available, so it stays the primary path: only it avoids caller-observable reads, since the fallback's `instanceof` walks the same-realm prototype chain and the branding read consults `Symbol.toStringTag`. The fallback still recognizes real errors from every realm because the branding lives on the instance, while a recursive branding walk would additionally admit objects that merely inherit from an error. Keeping disclosure independent of the guard means the fallback's known forgeries degrade classification only, never what a client can see.

## Consequences

Recognition semantics differ by runtime for hostile inputs: prototype and tag forgeries are rejected under the brand check but a tag forgery is accepted by the fallback, and a deliberately stripped error (own `stack` deleted, prototype detached, tag masked) evades the fallback and is treated as flat input on old runtimes. Specs cover both branches. The published `engines` field is a separate support-matrix decision and does not define where the code can run.
