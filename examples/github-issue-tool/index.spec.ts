import type { CreateErrorsOptions, VercelError } from '@vercel/error';
import { beforeEach, describe, it, vi } from 'vitest';

import {
  networkViolationChecks,
  runNetworkViolationCheck,
  runScenario,
  scenarios,
} from './test-cases.js';

const observed = vi.hoisted(() => ({ reports: [] as VercelError[] }));

// Observe real reporting before the real application sink runs, including throws.
vi.mock('@vercel/error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vercel/error')>();
  return {
    ...actual,
    createErrors: (options: CreateErrorsOptions) => {
      const onReport = options.onReport;
      if (!onReport) return actual.createErrors(options);
      return actual.createErrors({
        ...options,
        onReport: (error) => {
          observed.reports.push(error);
          return onReport(error);
        },
      });
    },
  };
});

beforeEach(() => {
  observed.reports.length = 0;
});

describe('getGitHubIssue with mocked HTTP', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => runScenario(scenario, observed.reports));
  }
  for (const mode of networkViolationChecks) {
    it(`fails verification for ${mode} even when the tool catches it`, () =>
      runNetworkViolationCheck(mode, observed.reports));
  }
});
