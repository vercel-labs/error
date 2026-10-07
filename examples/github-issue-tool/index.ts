import {
  createErrors,
  hasCode,
  isVercelError,
  type VercelError,
} from '@vercel/error';
import { buildErrorResponseData } from '@vercel/error/server';

const githubCodes = [
  'unavailable',
  'configuration_failed',
  'unknown_failure',
] as const;

/** Application-owned codes used by the tool's logs and fixed public guidance. */
export type GitHubIssueCode = (typeof githubCodes)[number];
/** Operation phase recorded for a failed lookup. */
export type GitHubIssueStage = 'setup' | 'request';

/** Provider issue fields returned unchanged after a successful lookup. */
export interface GitHubIssue {
  /** Repository-local issue number. */
  readonly number: number;
  /** Issue title. */
  readonly title: string;
  /** Optional issue body. */
  readonly body?: string;
}

/** Opaque client value returned by the injected initializer. */
export type GitHubIssueClient = object;

/** The application's success or approved failure result. */
export type GitHubIssueToolResult =
  | { readonly success: true; readonly issue: GitHubIssue }
  | {
      readonly success: false;
      readonly reason: 'github_failed';
      readonly nextStep: string;
    };

/** Allowlisted fields sent with `github_issue_fetch_failed`. */
export interface GitHubIssueLogFields {
  /** Fixed subsystem identity. */
  readonly scope: 'github';
  /** Fixed operation name. */
  readonly operation: 'getGitHubIssue';
  /** Whether setup or the issue request failed. */
  readonly stage: GitHubIssueStage;
  /** Application-owned classification. */
  readonly code: GitHubIssueCode;
  /** Whether this example advises another attempt, not whether failure is permanent. */
  readonly retryable: boolean;
  /** Observed provider status, included only for integers from 400 through 599. */
  readonly upstreamStatus?: number;
}

/** Synchronous sink for the allowlisted failure event; thrown errors propagate. */
export type GitHubIssueLogSink = (
  event: 'github_issue_fetch_failed',
  fields: GitHubIssueLogFields,
) => undefined;

/** Injected provider operations and application-owned logging. */
export interface GitHubIssueToolDependencies {
  /** Initialize the connection, or return null when none is configured. */
  readonly initializeClient: () => Promise<GitHubIssueClient | null>;
  /** Read one issue using the initialized client. */
  readonly getGitHubIssue: (
    client: GitHubIssueClient,
    issueNumber: number,
  ) => Promise<GitHubIssue>;
  readonly log: GitHubIssueLogSink;
}

/** Local classification passed to the reporting factory. */
export interface GitHubIssueFailureReport {
  /** Phase where the failure occurred. */
  readonly stage: GitHubIssueStage;
  /** Application-owned outcome code. */
  readonly code: GitHubIssueCode;
  /** Original thrown value, retained as the reported error's cause. */
  readonly cause?: unknown;
  /** Validated upstream status, kept in `attributes`, not `statusCode`. */
  readonly upstreamStatus?: number;
}

/**
 * Create the application reporter for terminal GitHub issue failures.
 * The synchronous sink receives only fixed and validated fields. Its exception
 * propagates unchanged. The returned error retains the original cause.
 */
export function createGitHubIssueReporter(
  log: GitHubIssueLogSink,
): (failure: GitHubIssueFailureReport) => VercelError<GitHubIssueCode> {
  const errors = createErrors<GitHubIssueCode>({
    scope: 'github',
    onReport(error) {
      const code =
        isVercelError(error) &&
        error.scope === 'github' &&
        hasCode(error, githubCodes)
          ? error.code
          : 'unknown_failure';
      const stageValue = error.attributes?.['github.stage'];
      if (stageValue !== 'setup' && stageValue !== 'request') {
        throw new TypeError('GitHub error stage must be setup or request');
      }

      const status = readValidUpstreamStatus(
        error.attributes?.['upstream.status'],
      );
      const fields = {
        scope: 'github',
        operation: 'getGitHubIssue',
        stage: stageValue,
        code,
        retryable: isRetryableCode(code),
        ...(status === undefined ? {} : { upstreamStatus: status }),
      } satisfies GitHubIssueLogFields;

      // Keep the event allowlisted; never pass the error or its diagnostics.
      log('github_issue_fetch_failed', fields);
    },
  });

  return (failure) =>
    errors.report('GitHub issue lookup failed', {
      code: failure.code,
      ...(Object.hasOwn(failure, 'cause') ? { cause: failure.cause } : {}),
      attributes: {
        'github.stage': failure.stage,
        ...(failure.upstreamStatus === undefined
          ? {}
          : { 'upstream.status': failure.upstreamStatus }),
      },
      public: { message: publicMessage(failure.code) },
    });
}

/**
 * Create a one-attempt GitHub issue lookup using injected provider operations.
 * Missing configuration and operation failures are reported after the
 * provider-operation catch; successful lookups are returned without reporting.
 */
export function createGitHubIssueTool(
  dependencies: GitHubIssueToolDependencies,
): (issueNumber: number) => Promise<GitHubIssueToolResult> {
  const reportFailure = createGitHubIssueReporter(dependencies.log);

  return async (issueNumber) => {
    let stage: GitHubIssueStage = 'setup';
    let outcome: GitHubIssueOutcome;
    try {
      const client = await dependencies.initializeClient();
      if (client === null) {
        outcome = { kind: 'missing_connection' };
      } else {
        stage = 'request';
        outcome = {
          kind: 'success',
          issue: await dependencies.getGitHubIssue(client, issueNumber),
        };
      }
    } catch (cause) {
      outcome = { kind: 'operation_failure', stage, cause };
    }

    if (outcome.kind === 'success') {
      return { success: true, issue: outcome.issue };
    }

    const failure: GitHubIssueFailureReport =
      outcome.kind === 'missing_connection'
        ? { stage: 'setup', code: 'configuration_failed' }
        : classifyOperationFailure(outcome);
    const error = reportFailure(failure);
    const data = buildErrorResponseData(error);
    return {
      success: false,
      reason: 'github_failed',
      nextStep: data.error.message,
    };
  };
}

type GitHubIssueOutcome =
  | { readonly kind: 'success'; readonly issue: GitHubIssue }
  | { readonly kind: 'missing_connection' }
  | {
      readonly kind: 'operation_failure';
      readonly stage: GitHubIssueStage;
      readonly cause: unknown;
    };

function classifyOperationFailure(
  failure: Extract<GitHubIssueOutcome, { kind: 'operation_failure' }>,
): GitHubIssueFailureReport {
  const upstreamStatus = readUpstreamStatus(failure.cause);
  return {
    stage: failure.stage,
    code:
      failure.stage === 'request' && upstreamStatus === 503
        ? 'unavailable'
        : 'unknown_failure',
    cause: failure.cause,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
  };
}

function readUpstreamStatus(cause: unknown): number | undefined {
  if (
    cause === null ||
    (typeof cause !== 'object' && typeof cause !== 'function')
  ) {
    return undefined;
  }

  try {
    const status = Reflect.get(cause, 'status') as unknown;
    return isValidUpstreamStatus(status) ? status : undefined;
  } catch {
    return undefined;
  }
}

function publicMessage(code: GitHubIssueCode): string {
  switch (code) {
    case 'configuration_failed':
      return 'Connect GitHub before reading this issue.';
    case 'unavailable':
      return 'We could not retrieve the GitHub issue. Try again later.';
    case 'unknown_failure':
      return 'We could not retrieve the GitHub issue. Check the application logs.';
    default:
      throw new TypeError('Unsupported GitHub issue code');
  }
}

function isRetryableCode(code: GitHubIssueCode): boolean {
  return code === 'unavailable';
}

function readValidUpstreamStatus(value: unknown): number | undefined {
  return isValidUpstreamStatus(value) ? value : undefined;
}

function isValidUpstreamStatus(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 400 &&
    value <= 599
  );
}
