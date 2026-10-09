import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { VercelError } from '@vercel/error';

import {
  expectedRequest,
  fakeToken,
  installHttpFixture,
  lookup,
} from './http-fixture.js';
import {
  getGitHubIssue,
  type FailureLogFields,
  type GitHubIssueResult,
} from './index.js';

const issue = JSON.parse(
  readFileSync(new URL('./fixtures/issue.json', import.meta.url), 'utf8'),
);
const responses = JSON.parse(
  readFileSync(new URL('./fixtures/responses.json', import.meta.url), 'utf8'),
);
const unknownResult: GitHubIssueResult = {
  success: false,
  reason: 'github_failed',
  nextStep:
    'We could not retrieve the GitHub issue. Check the application logs.',
};
const unknownFields: FailureLogFields = {
  scope: 'github',
  operation: 'getGitHubIssue',
  stage: 'request',
  code: 'unknown_failure',
  retryable: false,
};
const readFailure = new Error('PRIVATE_DIAGNOSTIC_SENTINEL: body read failed');
const transportFailures: unknown[] = [
  Object.assign(new Error('PRIVATE_DIAGNOSTIC_SENTINEL: transport failed'), {
    status: 503,
  }),
  {
    status: 503,
    scope: 'github',
    code: 'unavailable',
    public: { message: 'PRIVATE_PROVIDER_GUIDANCE_SENTINEL' },
    diagnostic: 'PRIVATE_DIAGNOSTIC_SENTINEL',
  },
  Object.assign(
    new VercelError('PRIVATE_DIAGNOSTIC_SENTINEL', {
      scope: 'github',
      code: 'unavailable',
      statusCode: 503,
      public: { message: 'PRIVATE_PROVIDER_GUIDANCE_SENTINEL' },
      metadata: { private: 'PRIVATE_PROVIDER_FIELD_SENTINEL' },
      attributes: { 'upstream.status': 503 },
    }),
    { status: 503 },
  ),
];

export interface Scenario {
  name: string;
  token?: string;
  deliver: () => Promise<Response>;
  requestCount: number;
  result: GitHubIssueResult;
  fields?: FailureLogFields;
  cause?: unknown;
  upstreamStatus?: number;
  sinkFailure?: unknown;
}

export const scenarios: Scenario[] = [
  {
    name: 'returns selected issue fields and sends one GitHub request',
    token: fakeToken,
    deliver: async () => Response.json(issue),
    requestCount: 1,
    result: {
      success: true,
      issue: {
        number: 42,
        title: '  A fabricated issue title  ',
        body: 'PRIVATE_ISSUE_CONTENT_SENTINEL\nFabricated issue content.',
        url: 'https://github.com/fixture-owner/fixture-repo/issues/42',
      },
    },
  },
  ...[undefined, ' \t\n'].map(
    (token): Scenario => ({
      name:
        token === undefined
          ? 'reports omitted credentials without a request'
          : 'reports blank credentials without a request',
      token,
      deliver: async () => {
        throw new Error('No request expected');
      },
      requestCount: 0,
      result: {
        success: false,
        reason: 'github_failed',
        nextStep:
          "GitHub is not configured. Configure the application's GitHub credentials and try again.",
      },
      fields: {
        scope: 'github',
        operation: 'getGitHubIssue',
        stage: 'setup',
        code: 'configuration_failed',
        retryable: false,
      },
    }),
  ),
  {
    name: 'classifies observed 503 without parsing its malformed body',
    token: fakeToken,
    deliver: async () =>
      new Response(responses.unavailable.body, {
        status: responses.unavailable.status,
      }),
    requestCount: 1,
    result: {
      success: false,
      reason: 'github_failed',
      nextStep: 'We could not retrieve the GitHub issue. Try again later.',
    },
    fields: {
      scope: 'github',
      operation: 'getGitHubIssue',
      stage: 'request',
      code: 'unavailable',
      retryable: true,
      upstreamStatus: 503,
    },
    upstreamStatus: 503,
  },
  ...['notFound', 'redirect'].map(
    (key): Scenario => ({
      name:
        key === 'notFound'
          ? 'uses neutral guidance for a documented 404'
          : 'rejects a documented redirect without another request or an error-status log field',
      token: fakeToken,
      deliver: async () =>
        Response.json(responses[key].body, { status: responses[key].status }),
      requestCount: 1,
      result: unknownResult,
      fields:
        key === 'notFound'
          ? { ...unknownFields, upstreamStatus: 404 }
          : unknownFields,
      upstreamStatus: responses[key].status,
    }),
  ),
  ...['null body', 'omitted body', 'pull request'].map(
    (variant): Scenario => ({
      name: `accepts ${variant} and ignores unselected provider fields`,
      token: fakeToken,
      deliver: async () => {
        const body = { ...issue, body: null };
        if (variant === 'omitted body') delete body.body;
        if (variant === 'pull request')
          body.pull_request = {
            url: 'https://api.github.com/repos/fixture-owner/fixture-repo/pulls/42',
            html_url: 'https://github.com/fixture-owner/fixture-repo/pull/42',
            diff_url:
              'https://github.com/fixture-owner/fixture-repo/pull/42.diff',
            patch_url:
              'https://github.com/fixture-owner/fixture-repo/pull/42.patch',
          };
        return Response.json(body);
      },
      requestCount: 1,
      result: {
        success: true,
        issue: {
          number: 42,
          title: '  A fabricated issue title  ',
          body: null,
          url: 'https://github.com/fixture-owner/fixture-repo/issues/42',
        },
      },
    }),
  ),
  {
    name: 'reports malformed JSON as an unknown request failure',
    token: fakeToken,
    deliver: async () =>
      new Response(responses.malformedSuccess, { status: 200 }),
    requestCount: 1,
    result: unknownResult,
    fields: unknownFields,
  },
  {
    name: 'retains a body-read rejection as the original cause',
    token: fakeToken,
    deliver: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(readFailure);
          },
        }),
        { status: 200 },
      ),
    requestCount: 1,
    result: unknownResult,
    fields: unknownFields,
    cause: readFailure,
  },
  ...transportFailures.map(
    (cause, index): Scenario => ({
      name: `wraps ${['an Error', 'a non-Error value', 'a recognized provider error'][index]} with local classification and guidance`,
      token: fakeToken,
      deliver: async () => {
        throw cause;
      },
      requestCount: 1,
      result: unknownResult,
      fields: unknownFields,
      cause,
    }),
  ),
  ...[
    new Error('PRIVATE_DIAGNOSTIC_SENTINEL: sink failed'),
    { private: 'PRIVATE_DIAGNOSTIC_SENTINEL: sink failed' },
  ].map(
    (sinkFailure, index): Scenario => ({
      name: `propagates the identical ${index === 0 ? 'Error' : 'non-Error'} sink failure after one attempt`,
      token: fakeToken,
      deliver: async () =>
        Response.json(responses.notFound.body, { status: 404 }),
      requestCount: 1,
      result: unknownResult,
      fields: { ...unknownFields, upstreamStatus: 404 },
      upstreamStatus: 404,
      sinkFailure,
    }),
  ),
  {
    name: 'rejects an invalid selected success shape',
    token: fakeToken,
    deliver: async () => Response.json(responses.invalidSuccess),
    requestCount: 1,
    result: unknownResult,
    fields: unknownFields,
  },
];

/** Execute the same observable checks against source and installed exports. */
export async function runScenario(
  scenario: Scenario,
  reports?: readonly VercelError[],
): Promise<void> {
  const http = installHttpFixture(scenario.deliver, scenario.requestCount);
  const logs: unknown[] = [];
  try {
    const operation = getGitHubIssue(lookup, {
      token: scenario.token,
      fetch: http.fetch,
      log: (event, fields) => {
        logs.push({ event, fields });
        if ('sinkFailure' in scenario) throw scenario.sinkFailure;
      },
    });
    let result: GitHubIssueResult | undefined;
    if ('sinkFailure' in scenario) {
      await assert.rejects(operation, (failure: unknown) => {
        assert.equal(failure, scenario.sinkFailure);
        return true;
      });
    } else {
      result = await operation;
      assert.deepEqual(result, scenario.result);
    }
    assert.deepEqual(
      logs,
      scenario.fields
        ? [{ event: 'github_issue_fetch_failed', fields: scenario.fields }]
        : [],
    );
    if (scenario.result.success) {
      assert.deepEqual(http.requests, [
        { input: expectedRequest.url, options: expectedRequest.options },
      ]);
    }
    const disclosed = JSON.stringify({ result, logs });
    for (const sentinel of [
      'FAKE_PRIVATE_TOKEN_SENTINEL',
      'PRIVATE_REPOSITORY_SENTINEL',
      'PRIVATE_PROVIDER_FIELD_SENTINEL',
      'PRIVATE_PROVIDER_MESSAGE_SENTINEL',
      'PRIVATE_MALFORMED_PROVIDER_BODY_SENTINEL',
      'PRIVATE_DIAGNOSTIC_SENTINEL',
      'PRIVATE_PROVIDER_GUIDANCE_SENTINEL',
      ...(scenario.result.success ? [] : ['PRIVATE_ISSUE_CONTENT_SENTINEL']),
    ]) {
      assert.ok(!disclosed.includes(sentinel), `Disclosed ${sentinel}`);
    }
    if (reports) {
      assert.equal(reports.length, scenario.fields ? 1 : 0, 'Report attempts');
      if (scenario.fields) {
        assert.equal(reports[0]?.statusCode, undefined);
        if ('cause' in scenario)
          assert.equal(reports[0]?.cause, scenario.cause);
        assert.deepEqual(
          reports[0]?.attributes,
          scenario.fields.upstreamStatus === undefined
            ? undefined
            : { 'upstream.status': scenario.fields.upstreamStatus },
        );
        if (scenario.upstreamStatus !== undefined) {
          const originalCause = reports[0]?.cause;
          assert.ok(originalCause instanceof Error);
          assert.equal(
            originalCause.message,
            `GitHub issue request returned HTTP ${scenario.upstreamStatus}`,
          );
        }
      }
    }
  } finally {
    http.restore();
    http.verify();
  }
}

export const networkViolationChecks: readonly string[] = [
  'unexpected request',
  'extra request',
  'global fetch',
];

/** Prove swallowed boundary exceptions still fail independent verification. */
export async function runNetworkViolationCheck(
  mode: string,
  reports?: readonly VercelError[],
): Promise<void> {
  const http = installHttpFixture(async () => Response.json(issue));
  const logs: unknown[] = [];
  try {
    const result = await getGitHubIssue(lookup, {
      token: fakeToken,
      fetch: async (input, options) => {
        if (mode === 'global fetch') return globalThis.fetch(input, options);
        if (mode === 'unexpected request')
          return http.fetch(`${input}/unexpected`, options);
        await http.fetch(input, options);
        return http.fetch(input, options);
      },
      log: (event, fields) => {
        logs.push({ event, fields });
      },
    });
    assert.deepEqual(result, unknownResult);
    assert.deepEqual(logs, [
      { event: 'github_issue_fetch_failed', fields: unknownFields },
    ]);
    if (reports) assert.equal(reports.length, 1);
    assert.equal(
      http.requests.length,
      mode === 'global fetch' ? 0 : mode === 'extra request' ? 2 : 1,
    );
    assert.throws(http.verify, /HTTP delivery violations/);
  } finally {
    http.restore();
  }
}
