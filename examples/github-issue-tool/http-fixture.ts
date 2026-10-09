import assert from 'node:assert/strict';

export const fakeToken: string = 'FAKE_PRIVATE_TOKEN_SENTINEL_NEVER_VALID';
export const lookup: { owner: string; repo: string; issueNumber: number } = {
  owner: 'fixture-owner',
  repo: 'PRIVATE_REPOSITORY_SENTINEL',
  issueNumber: 42,
};
export const expectedRequest: { url: string; options: RequestInit } = {
  url: 'https://api.github.com/repos/fixture-owner/PRIVATE_REPOSITORY_SENTINEL/issues/42',
  options: {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer FAKE_PRIVATE_TOKEN_SENTINEL_NEVER_VALID',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'vercel-error-github-issue-tool',
    },
    redirect: 'manual',
  },
};

export interface HttpFixture {
  fetch: typeof fetch;
  requests: {
    input: Parameters<typeof fetch>[0];
    options: RequestInit | undefined;
  }[];
  verify: () => void;
  restore: () => void;
}

/** Deny global delivery and record violations even when the tool catches them. */
export function installHttpFixture(
  deliver: () => Promise<Response>,
  requestCount = 1,
): HttpFixture {
  const requests: HttpFixture['requests'] = [];
  const violations: string[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: async () => {
      violations.push('Global fetch is forbidden');
      throw new Error('Global fetch is forbidden');
    },
  });

  return {
    requests,
    fetch: async (input, options) => {
      requests.push({ input, options });
      try {
        assert.ok(requests.length <= requestCount, 'Unexpected extra request');
        assert.deepEqual(
          { url: input, options },
          expectedRequest,
          'Unexpected request',
        );
      } catch (error) {
        violations.push('Unexpected request');
        throw error;
      }
      return deliver();
    },
    verify: () => {
      assert.deepEqual(violations, [], 'HTTP delivery violations');
      assert.equal(requests.length, requestCount, 'Request count');
    },
    restore: () => {
      if (original) Object.defineProperty(globalThis, 'fetch', original);
      else Reflect.deleteProperty(globalThis, 'fetch');
    },
  };
}
