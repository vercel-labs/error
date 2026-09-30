# Why @vercel/error keeps error identity out of prose

## Problem

An error message starts as text for a reader. It becomes a fragile protocol when callers parse it to choose a retry, display it as client copy, or use its words as an identifier. Sending the same error across HTTP can expose developer details, while hiding every field leaves clients unable to distinguish known failures.

## Alternatives considered

Native `Error` is the right choice for a local failure that no other caller classifies, transports, or reports. It keeps simple code simple. It does not provide stable identity or separate diagnostic text from reviewed client copy.

An application-specific helper is a good fit when one application owns the vocabulary and all consumers follow the same transport rules. It keeps local policy close to the handlers. Separate packages then need their own mappings and response checks.

A framework-specific error type is useful when a framework owns the request path and its handlers need framework behavior. It ties error handling to that transport and does not cover workers, command-line tools, or package boundaries.

## Decision

The package separates responsibilities where errors move between consumers. Producers preserve the original failure through `cause` and add `scope` or `code` when another caller needs stable identity. Software branches on those fields, never on prose or terminal output. HTTP handlers choose reviewed identity and status mappings and expose only approved `public` details. Clients validate the response shape and add context they observed locally. People and agents read diagnostic and recovery text, but that text does not authorize an action.

The disclosure boundary and response-data seam are recorded in [ADR 0001](adr/0001-separate-developer-and-public-error-details.md), [ADR 0002](adr/0002-separate-response-data-from-http-response.md), and [ADR 0009](adr/0009-read-http-responses-through-the-client-entry-point.md). [ADR 0010](adr/0010-normalize-response-identity-and-public-details.md) and [ADR 0011](adr/0011-complete-ansi-content-negotiation.md) record the normalization and negotiation rules. The [README](../README.md) remains the interface reference.

## Adoption path

Install with `pnpm add @vercel/error`. Direct Node.js execution requires Node.js 24 or newer, and the package is ESM-only. Start with the [runnable README example](https://github.com/vercel-labs/error/blob/main/README.md#quick-start).

For repository context, read [CONTEXT.md](../CONTEXT.md), [AGENTS.md](../AGENTS.md), the [ADR index](adr/README.md), and the [changelog](../CHANGELOG.md). Coding agents can use the [vercel-error skill](../skills/vercel-error/SKILL.md). The [security policy](../SECURITY.md) describes vulnerability reporting.

Use [GitHub Issues](https://github.com/vercel-labs/error/issues) for package support and bugs. Report vulnerabilities through [Vercel's Open Source Bug Bounty program](https://hackerone.com/vercel-open-source); do not report them in a public issue.
