# Why @vercel/error separates codes from messages

## Problem

When code parses an error message to decide what to do, a wording change can break that code. Sending the same message over HTTP can expose details meant for developers. Clients still need a way to identify known failures without reading developer text.

## Alternatives considered

Native `Error` works well for a failure handled in one place. It does not provide separate fields for a stable code and client-approved text.

An application-specific helper works when one app owns the error codes and every response. It keeps those rules close to the handlers. Separate packages would each need their own mappings and checks.

A framework-specific error type works when one framework handles the request. It does not cover workers, command-line tools, or errors shared between packages.

## Decision

The package gives each reader the information they need:

- Code uses `scope` and `code` to identify an error. It does not parse messages or terminal output.
- Error producers keep the original failure in `cause` and add identity when another caller needs it.
- HTTP handlers choose which identity, status, and `public` details clients may see.
- Clients check the response data and add only context they observed themselves.
- People and agents read diagnostic and recovery text. That text does not authorize an action.

## Adoption path

Install with `pnpm add @vercel/error`. Direct Node.js use requires Node.js 24 or newer. The package is ESM-only.

Start with the [README example](https://github.com/vercel-labs/error/blob/main/README.md#quick-start).

For repository terms and decisions, read [CONTEXT.md](../CONTEXT.md) and the [ADR index](adr/README.md). [AGENTS.md](../AGENTS.md) has code rules. The [changelog](../CHANGELOG.md) lists releases. Coding agents can use the [vercel-error skill](../skills/vercel-error/SKILL.md).

Use [GitHub Issues](https://github.com/vercel-labs/error/issues) for support and bugs. Report vulnerabilities through [Vercel's Open Source Bug Bounty program](https://hackerone.com/vercel-open-source), as described in the [security policy](../SECURITY.md).
