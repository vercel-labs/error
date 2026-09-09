# Keep the package a thin core without adapters

## Context

Error libraries often add middleware and integrations for frameworks, reporters, and telemetry exporters. This package replaces utilities that ship in client bundles across many applications. Its purpose is to define a stable error shape and disclosure rules.

## Decision

The package provides the error contract and four integration points: `onReport`, `onSerialize`, OpenTelemetry-compatible `attributes`, and a framework-neutral `ErrorResponse`. Applications own framework, reporter, and exporter adapters. The package has no runtime dependencies.

## Reason

These integration points keep ordinary adapters to a few lines of application code. Shipping adapters here would require this package to follow framework releases, add dependencies, and maintain APIs outside the error contract. Keeping only the contract also keeps the same code usable in browsers, workers, edge runtimes, and Node.

## Consequences

Consumers write their own adapters. Revisit this decision only when a real adapter needs enough shared logic to justify a package. That adapter must be a separate package that depends on this one, not a dependency of this package.
