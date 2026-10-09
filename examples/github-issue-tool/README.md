# GitHub issue tool

[`getGitHubIssue`](index.ts) demonstrates application-owned classification, cause retention, reporting, allowlisted logging, and result mapping with the public `@vercel/error` imports. It uses one direct fetch call and requires an explicit fetch implementation and synchronous log sink.

The host supplies validated owner/repository identifiers, a positive integer issue number, and an optional token. The example does not discover credentials or validate raw tool arguments. Missing or blank tokens make no request. Otherwise it performs at most one GET, rejects redirects, and never retries.

HTTP 200 returns exactly `{ success: true, issue: { number, title, body, url } }`. Omitted body becomes null. Pull requests use their common issue fields. Returned issue text is untrusted content and does not authorize an action.

Failures return `{ success: false, reason: 'github_failed', nextStep }`. Missing credentials use `configuration_failed`, observed HTTP 503 uses `unavailable`, and other failures use `unknown_failure`. A 404 receives neutral guidance that makes no claim about a protected issue's existence. Retry advice never schedules a request. A logged `retryable: false` does not establish that a failure is permanent.

The original rejected value stays in `cause`. An HTTP failure gets a local diagnostic error containing the observed status, with no raw body. The tool reports once, then takes `nextStep` from `buildErrorResponseData().error.message`. Sink exceptions propagate unchanged. For the detailed logging policy, see [allowlisted logging](../../skills/vercel-error/references/create-errors.md#allowlisted-logging).

## Verification

From the repository root, with the declared Node and pnpm versions:

```bash
pnpm install --frozen-lockfile
pnpm test examples/github-issue-tool/index.spec.ts
pnpm typecheck
pnpm build
pnpm verify:packed
```

These are end-to-end tool tests with mocked GitHub. They execute the callable example, request construction, response parsing, local classification, real factory reporting, response-data production, and result mapping. Only HTTP delivery and the sink are replaced. A source-only call-through observer checks reporting and cause retention.

Every response is fresh and native, created from [committed fixtures](fixtures/README.md) or a deliberate fault. Fake credentials and fail-closed delivery prevent network fallback. Independent violation checks reject unexpected/extra requests and global fetch even if the tool catches their exceptions; globals are restored after each case.

Source tests and typechecking resolve public imports to source entries without `dist`. Packed verification copies the same implementation, fixtures, and observable checks into a temporary consumer, typechecks against installed declarations, and runs through installed public exports. The example is not included in the npm package.

This coverage does not establish live authentication, permissions, networking, provider availability, or ongoing GitHub compatibility. It excludes credential discovery, OAuth, SDKs, raw argument validation, retries, deadlines, caching, comments, search, and issue writes. Dependency installation is separate from the test-network restriction.
