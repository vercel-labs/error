import {
  createGitHubIssueTool,
  type GitHubIssueLogFields,
} from './github-issue-tool.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const records: Array<{
  readonly event: string;
  readonly fields: GitHubIssueLogFields;
}> = [];
let initializeCalls = 0;
let requestCalls = 0;
const tool = createGitHubIssueTool({
  async initializeClient() {
    initializeCalls += 1;
    return {};
  },
  async getGitHubIssue() {
    requestCalls += 1;
    throw Object.assign(new Error('PACKED_PRIVATE_PROVIDER_TEXT'), {
      status: 503,
    });
  },
  log(event, fields) {
    records.push({ event, fields });
    return undefined;
  },
});

const result = await tool(42);
assert(
  JSON.stringify(result) ===
    JSON.stringify({
      success: false,
      reason: 'github_failed',
      nextStep: 'We could not retrieve the GitHub issue. Try again later.',
    }),
  'packed GitHub issue example returned the wrong result',
);
assert(initializeCalls === 1, 'packed example initialized more than once');
assert(requestCalls === 1, 'packed example retried the issue request');
assert(records.length === 1, 'packed example did not report exactly once');
assert(
  JSON.stringify(records) ===
    JSON.stringify([
      {
        event: 'github_issue_fetch_failed',
        fields: {
          scope: 'github',
          operation: 'getGitHubIssue',
          stage: 'request',
          code: 'unavailable',
          retryable: true,
          upstreamStatus: 503,
        },
      },
    ]),
  'packed example emitted the wrong allowlisted log record',
);
assert(
  !JSON.stringify({ result, records }).includes('PACKED_PRIVATE_PROVIDER_TEXT'),
  'packed example disclosed provider text',
);
