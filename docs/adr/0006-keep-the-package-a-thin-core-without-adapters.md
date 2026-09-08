# Keep the package a thin core without adapters

## Context

Error tooling commonly accretes framework middleware, reporter integrations, and exporter glue. This package replaces utilities that ship to client bundles across many applications, and its value is a stable error shape with a disclosure contract.

## Decision

The package ships the error contract and its seams only: `onReport` for reporting, `onSerialize` for serialization telemetry, OpenTelemetry-compatible `attributes`, and a framework-neutral `ErrorResponse`. Framework, reporter, and exporter adapters live in applications, and the package stays free of runtime dependencies.

## Reason

The seams make an adapter a few lines of application code, while in-tree adapters would couple this package's release cadence to every framework's, add dependencies to a dependency-free package, and grow a surface the contract does not need. The shape is the product; a thin core stays isomorphic, auditable, and cheap to trust.

## Consequences

Consumers write their own glue. Revisit only when a real consumer's adapter proves substantial rather than a few lines; such an adapter becomes a separate package that depends on this one, never a dependency of it.
