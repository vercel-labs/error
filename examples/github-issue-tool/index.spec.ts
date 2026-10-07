import { VercelError, hasCode, isVercelError } from '@vercel/error';

import {
  createGitHubIssueTool,
  createGitHubIssueReporter,
  type GitHubIssue,
  type GitHubIssueLogFields,
  type GitHubIssueToolDependencies,
} from './index';

const issue: GitHubIssue = { number: 42, title: 'Fix the parser' };
const client = {};

function makeHarness(overrides: Partial<GitHubIssueToolDependencies> = {}) {
  const initializeClient = vi.fn(
    overrides.initializeClient ?? (async () => client),
  );
  const getGitHubIssue = vi.fn(overrides.getGitHubIssue ?? (async () => issue));
  const log = vi.fn(
    overrides.log ??
      ((_event: 'github_issue_fetch_failed', _fields: GitHubIssueLogFields) =>
        undefined),
  );
  const tool = createGitHubIssueTool({
    initializeClient,
    getGitHubIssue,
    log,
  });

  return { getGitHubIssue, initializeClient, log, tool };
}

describe('GitHub issue tool', () => {
  it('reports a missing connection without making an issue request', async () => {
    const harness = makeHarness({
      initializeClient: async () => null,
    });

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep: 'Connect GitHub before reading this issue.',
    });
    expect(harness.initializeClient).toHaveBeenCalledTimes(1);
    expect(harness.getGitHubIssue).not.toHaveBeenCalled();
    expect(harness.log).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'setup',
      code: 'configuration_failed',
      retryable: false,
    });
  });

  it('returns the retrieved issue without reporting success', async () => {
    const harness = makeHarness();

    const result = await harness.tool(42);

    expect(result).toEqual({ success: true, issue });
    expect(harness.initializeClient).toHaveBeenCalledTimes(1);
    expect(harness.getGitHubIssue).toHaveBeenCalledExactlyOnceWith(client, 42);
    expect(harness.log).not.toHaveBeenCalled();
  });

  it('keeps initialization failures in setup even when they expose status 503', async () => {
    const cause = Object.assign(new Error('PRIVATE_SETUP_FAILURE'), {
      status: 503,
    });
    const harness = makeHarness({
      initializeClient: async () => {
        throw cause;
      },
    });

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep:
        'We could not retrieve the GitHub issue. Check the application logs.',
    });
    expect(harness.initializeClient).toHaveBeenCalledTimes(1);
    expect(harness.getGitHubIssue).not.toHaveBeenCalled();
    expect(harness.log).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'setup',
      code: 'unknown_failure',
      retryable: false,
      upstreamStatus: 503,
    });
    expect(
      JSON.stringify({ result, calls: harness.log.mock.calls }),
    ).not.toContain('PRIVATE_SETUP_FAILURE');
  });

  it('maps a request status 503 to fixed retry guidance', async () => {
    const cause = Object.assign(new Error('PRIVATE_REQUEST_FAILURE'), {
      status: 503,
    });
    const harness = makeHarness({
      getGitHubIssue: async () => {
        throw cause;
      },
    });

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep: 'We could not retrieve the GitHub issue. Try again later.',
    });
    expect(harness.initializeClient).toHaveBeenCalledTimes(1);
    expect(harness.getGitHubIssue).toHaveBeenCalledExactlyOnceWith(client, 42);
    expect(harness.log).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unavailable',
      retryable: true,
      upstreamStatus: 503,
    });
    expect(
      JSON.stringify({ result, calls: harness.log.mock.calls }),
    ).not.toContain('PRIVATE_REQUEST_FAILURE');
  });

  it('uses unknown_failure for other valid request statuses', async () => {
    const cause = Object.assign(new Error('PRIVATE_NOT_FOUND'), {
      status: 404,
    });
    const harness = makeHarness({
      getGitHubIssue: async () => {
        throw cause;
      },
    });

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep:
        'We could not retrieve the GitHub issue. Check the application logs.',
    });
    expect(harness.getGitHubIssue).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unknown_failure',
      retryable: false,
      upstreamStatus: 404,
    });
    expect(harness.log).toHaveBeenCalledTimes(1);
  });

  it('handles a non-Error request throw without inventing status', async () => {
    const harness = makeHarness({
      getGitHubIssue: async () => {
        throw 'PRIVATE_NON_ERROR';
      },
    });

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep:
        'We could not retrieve the GitHub issue. Check the application logs.',
    });
    expect(harness.getGitHubIssue).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unknown_failure',
      retryable: false,
    });
    expect(
      JSON.stringify({ result, calls: harness.log.mock.calls }),
    ).not.toContain('PRIVATE_NON_ERROR');
  });

  it.each([200, 399, 600, 503.5, Number.NaN, '503'])(
    'omits invalid upstream status %s',
    async (status) => {
      const cause = Object.assign(new Error('PRIVATE_INVALID_STATUS'), {
        status,
      });
      const harness = makeHarness({
        getGitHubIssue: async () => {
          throw cause;
        },
      });

      const result = await harness.tool(42);

      expect(result).toEqual({
        success: false,
        reason: 'github_failed',
        nextStep:
          'We could not retrieve the GitHub issue. Check the application logs.',
      });
      expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
        scope: 'github',
        operation: 'getGitHubIssue',
        stage: 'request',
        code: 'unknown_failure',
        retryable: false,
      });
      expect(harness.getGitHubIssue).toHaveBeenCalledTimes(1);
      expect(harness.log).toHaveBeenCalledTimes(1);
    },
  );

  it('omits status when reading the optional provider field throws', async () => {
    const cause = new Error('PRIVATE_STATUS_GETTER');
    Object.defineProperty(cause, 'status', {
      get() {
        throw new Error('PRIVATE_STATUS_READ_FAILURE');
      },
    });
    const harness = makeHarness({
      getGitHubIssue: async () => {
        throw cause;
      },
    });

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep:
        'We could not retrieve the GitHub issue. Check the application logs.',
    });
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unknown_failure',
      retryable: false,
    });
    expect(harness.getGitHubIssue).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledTimes(1);
  });

  it('keeps provider prose private even for a recognized matching error', async () => {
    class MatchingProviderError extends VercelError<'unavailable'> {
      readonly status = 503;
    }
    const cause = new MatchingProviderError('PRIVATE_PROVIDER_MESSAGE', {
      code: 'unavailable',
      scope: 'github',
      statusCode: 418,
      public: { message: 'PRIVATE_PROVIDER_PUBLIC_MESSAGE' },
      attributes: { 'provider.secret': 'PRIVATE_PROVIDER_ATTRIBUTE' },
    });
    const harness = makeHarness({
      getGitHubIssue: async () => {
        throw cause;
      },
    });

    expect(isVercelError(cause)).toBe(true);
    expect(cause.scope).toBe('github');
    expect(hasCode(cause, 'unavailable')).toBe(true);

    const result = await harness.tool(42);

    expect(result).toEqual({
      success: false,
      reason: 'github_failed',
      nextStep: 'We could not retrieve the GitHub issue. Try again later.',
    });
    expect(harness.log).toHaveBeenCalledWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unavailable',
      retryable: true,
      upstreamStatus: 503,
    });
    expect(harness.getGitHubIssue).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledTimes(1);
    const output = JSON.stringify({ result, calls: harness.log.mock.calls });
    expect(output).not.toContain('PRIVATE_PROVIDER_MESSAGE');
    expect(output).not.toContain('PRIVATE_PROVIDER_PUBLIC_MESSAGE');
    expect(output).not.toContain('PRIVATE_PROVIDER_ATTRIBUTE');
  });

  it('retains the original cause and stores observed status as an attribute', () => {
    const cause = { privateDetail: 'PRIVATE_CAUSE_DETAIL' };
    const log = vi.fn(
      (_event: 'github_issue_fetch_failed', _fields: GitHubIssueLogFields) =>
        undefined,
    );
    const reportFailure = createGitHubIssueReporter(log);

    const error = reportFailure({
      stage: 'request',
      code: 'unavailable',
      cause,
      upstreamStatus: 503,
    });

    expect(error.cause).toBe(cause);
    expect(error.statusCode).toBeUndefined();
    expect(error.attributes).toEqual({
      'github.stage': 'request',
      'upstream.status': 503,
    });
    expect(error.public?.message).toBe(
      'We could not retrieve the GitHub issue. Try again later.',
    );
    expect(log).toHaveBeenCalledExactlyOnceWith('github_issue_fetch_failed', {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unavailable',
      retryable: true,
      upstreamStatus: 503,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'PRIVATE_CAUSE_DETAIL',
    );
  });

  it('preserves an explicitly thrown undefined cause', () => {
    const log = vi.fn(
      (_event: 'github_issue_fetch_failed', _fields: GitHubIssueLogFields) =>
        undefined,
    );
    const reportFailure = createGitHubIssueReporter(log);

    const error = reportFailure({
      stage: 'request',
      code: 'unknown_failure',
      cause: undefined,
    });

    expect(Object.hasOwn(error, 'cause')).toBe(true);
    expect(error.cause).toBeUndefined();
  });

  it('propagates a log sink failure unchanged without retrying or returning a result', async () => {
    const sinkFailure = new Error('PRIVATE_LOG_SINK_FAILURE');
    const log = vi.fn(
      (
        _event: 'github_issue_fetch_failed',
        _fields: GitHubIssueLogFields,
      ): undefined => {
        throw sinkFailure;
      },
    );
    const harness = makeHarness({
      getGitHubIssue: async () => {
        throw Object.assign(new Error('PRIVATE_REQUEST_FAILURE'), {
          status: 503,
        });
      },
      log,
    });

    await expect(harness.tool(42)).rejects.toBe(sinkFailure);

    expect(harness.initializeClient).toHaveBeenCalledTimes(1);
    expect(harness.getGitHubIssue).toHaveBeenCalledExactlyOnceWith(client, 42);
    expect(harness.log).toHaveBeenCalledTimes(1);
    expect(harness.log).toHaveBeenCalledWith(
      'github_issue_fetch_failed',
      expect.objectContaining({ code: 'unavailable', upstreamStatus: 503 }),
    );
  });
});
