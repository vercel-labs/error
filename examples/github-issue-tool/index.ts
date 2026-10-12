import { createErrors } from '@vercel/error';
import { buildErrorResponseData } from '@vercel/error/server';

/** Selected issue content. The host decides how to use this untrusted text. */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  url: string;
}

/** Application-owned classifications, independent of provider error identity. */
export type GitHubIssueCode =
  | 'configuration_failed'
  | 'unavailable'
  | 'unknown_failure';

/** Stage where setup or the single request failed. */
export type FailureStage = 'setup' | 'request';

/** Approved log fields; upstreamStatus is limited to observed error statuses. */
export interface FailureLogFields {
  scope: 'github';
  operation: 'getGitHubIssue';
  stage: FailureStage;
  code: GitHubIssueCode;
  retryable: boolean;
  upstreamStatus?: number;
}

/** Host-validated repository identifiers and a positive integer issue number. */
export interface IssueLookup {
  owner: string;
  repo: string;
  issueNumber: number;
}

/** Explicit HTTP delivery and synchronous logging. No credential discovery. */
export interface GitHubIssueOptions {
  token?: string;
  fetch: typeof fetch;
  log: (
    event: 'github_issue_fetch_failed',
    fields: FailureLogFields,
  ) => undefined;
}

/** Stable failure reason and approved guidance, or selected issue content. */
export type GitHubIssueResult =
  | { success: true; issue: GitHubIssue }
  | { success: false; reason: 'github_failed'; nextStep: string };

function selectIssue(value: unknown): GitHubIssue {
  if (typeof value !== 'object' || value === null)
    throw new Error('Invalid GitHub issue object');
  const issue = value as Record<string, unknown>;
  if (
    typeof issue.number !== 'number' ||
    !Number.isInteger(issue.number) ||
    issue.number <= 0 ||
    typeof issue.title !== 'string' ||
    (issue.body !== undefined &&
      issue.body !== null &&
      typeof issue.body !== 'string') ||
    typeof issue.html_url !== 'string'
  )
    throw new Error('Invalid selected GitHub issue fields');
  const url = new URL(issue.html_url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Invalid GitHub issue web URL');
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? null,
    url: issue.html_url,
  };
}

/**
 * Retrieve selected issue content with one GET, accepting only HTTP 200.
 * The host validates identifiers; fetch and the synchronous log sink are required.
 * Missing/blank tokens make no request. Failures are classified locally, reported
 * once with allowlisted fields, and mapped to approved nextStep text. Original
 * rejected values stay in cause, never in the tool result or log.
 * Redirects are rejected and retry advice never schedules another request.
 * Sink exceptions reject this promise with the identical thrown value.
 */
export async function getGitHubIssue(
  input: IssueLookup,
  options: GitHubIssueOptions,
): Promise<GitHubIssueResult> {
  let stage: FailureStage = 'setup';
  let code: GitHubIssueCode = 'unknown_failure';
  let cause: unknown;
  let upstreamStatus: number | undefined;
  try {
    if (!options.token?.trim()) {
      code = 'configuration_failed';
      throw new Error('GitHub token is missing');
    }
    stage = 'request';
    const response = await options.fetch(
      `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues/${encodeURIComponent(input.issueNumber)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${options.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'vercel-error-github-issue-tool',
        },
        redirect: 'manual',
      },
    );
    const status = response.status;
    if (status !== 200) {
      code = status === 503 ? 'unavailable' : 'unknown_failure';
      if (Number.isInteger(status) && status >= 400 && status <= 599)
        upstreamStatus = status;
      const failure = new Error(`GitHub issue request returned HTTP ${status}`);
      try {
        await response.body?.cancel();
      } catch {
        // Keep the observed HTTP failure if releasing the unused body fails.
      }
      throw failure;
    }
    return { success: true, issue: selectIssue(await response.json()) };
  } catch (error) {
    cause = error;
  }

  const errors = createErrors<GitHubIssueCode>({
    scope: 'github',
    onReport: (error) => {
      const status = error.attributes?.['upstream.status'];
      const isAllowedStatus =
        typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 400 &&
        status <= 599;
      const fields: FailureLogFields = {
        scope: 'github',
        operation: 'getGitHubIssue',
        stage,
        code: error.code ?? 'unknown_failure',
        retryable: error.code === 'unavailable',
        ...(isAllowedStatus ? { upstreamStatus: status } : {}),
      };
      options.log('github_issue_fetch_failed', fields);
    },
  });
  const error = errors.report('GitHub issue lookup failed', {
    code,
    cause,
    ...(upstreamStatus === undefined
      ? {}
      : { attributes: { 'upstream.status': upstreamStatus } }),
    public: {
      message:
        code === 'configuration_failed'
          ? "GitHub is not configured. Configure the application's GitHub credentials and try again."
          : code === 'unavailable'
            ? 'We could not retrieve the GitHub issue. Try again later.'
            : 'We could not retrieve the GitHub issue. Check the application logs.',
    },
  });
  const data = buildErrorResponseData(error);
  return {
    success: false,
    reason: 'github_failed',
    nextStep: data.error.message,
  };
}
