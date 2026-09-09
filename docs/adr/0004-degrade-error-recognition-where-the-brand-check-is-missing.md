# Fall back when `Error.isError` is unavailable

## Context

The same package modules run in browsers, workers, edge runtimes, and Node. `Error.isError` accurately recognizes errors across realms and rejects forged errors, but older runtimes do not provide it. Requiring the builtin would make `isError` throw in those runtimes.

## Decision

Capture `Error.isError` when the module loads and use it when available. Otherwise, use `instanceof` followed by `Object.prototype.toString` on the value. If a trap or getter throws during either check, classify the value as not an error. Client-safe serialization applies a separate rule: it rejects any untagged value with a `name` or `stack` field.

## Reason

The builtin is the more accurate check and does not read caller-controlled properties. The fallback is less precise: `instanceof` reads the same-realm prototype chain, and `Object.prototype.toString` reads `Symbol.toStringTag`. It still recognizes real errors from other realms. Checking only the value avoids the extra false positives of recursively checking its prototypes. The separate serialization check prevents ordinary recognition differences from changing which developer details reach clients.

## Consequences

Hostile inputs can produce different results by runtime. The builtin rejects prototype and tag forgeries, while the fallback accepts a forged `Symbol.toStringTag`. On an older runtime, an error whose own `stack` is deleted, prototype is detached, and tag is masked also evades the fallback and is treated as flat input. Tests cover both branches. The published `engines` field defines supported Node versions, not every runtime where the code can execute.
