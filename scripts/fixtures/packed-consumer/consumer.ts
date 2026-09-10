import {
  VercelError,
  createErrors,
  hasCode,
  isErrorLike,
  isVercelError,
  type ErrorResponseData,
  type VercelErrorOptions,
} from '@vercel/error';
import {
  fromErrorResponse,
  parseErrorResponse,
  type ErrorResponseData as ClientErrorResponseData,
} from '@vercel/error/client';
import { fix, formatError, frame, hint, link } from '@vercel/error/format';
import {
  errorResponse,
  wantsAnsi,
  type ErrorResponse,
  type ErrorResponseInput,
} from '@vercel/error/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type VisitorCode = 'bad_request' | 'unavailable';
let reportedCode: VisitorCode | undefined;
const visitorErrors = createErrors<VisitorCode>({
  scope: 'visitor-signals',
  onReport: (error) => {
    reportedCode = error.code;
  },
});
const reported = visitorErrors.report('Internal visitor failure', {
  code: 'unavailable',
  public: { message: 'Visitor signals are unavailable' },
  statusCode: 503,
});
assert(reportedCode === 'unavailable', 'typed scoped report callback failed');

const publicInput: ErrorResponseInput = {
  message: 'Public input failed',
  statusCode: 400,
};
const publicResponse: ErrorResponse = errorResponse(publicInput);
assert(
  publicResponse.status === 400,
  'ErrorResponseInput status was not preserved in ErrorResponse',
);

type CliErrorOptions = VercelErrorOptions<'cli_failure'>;
class CliError extends VercelError<'cli_failure'> {
  readonly retryable = true;
  constructor(message: string, options: CliErrorOptions = {}) {
    super(message, options);
    this.name = 'CliError';
  }
}
const cliErrors = createErrors({ ErrorClass: CliError, scope: 'cli' });
const cliError = cliErrors.create('CLI failed', { code: 'cli_failure' });
assert(cliError.retryable, 'custom CliError instance was not retryable');
assert(hasCode(cliError, 'cli_failure'), 'hasCode failed');
assert(isErrorLike(cliError), 'isErrorLike failed');
const unknownCliError: unknown = cliError;
if (hasCode(unknownCliError, 'cli_failure')) {
  const exactCode: 'cli_failure' = unknownCliError.code;
  assert(exactCode === 'cli_failure', 'hasCode narrowing failed');
}
if (isErrorLike(unknownCliError)) {
  const message: string = unknownCliError.message;
  assert(message === 'CLI failed', 'isErrorLike narrowing failed');
}
if (isVercelError(unknownCliError)) {
  const metadata = unknownCliError.metadata;
  assert(metadata === undefined, 'isVercelError narrowing failed');
}

function verifyTypeContracts(error: CliError, data: ErrorResponseData): void {
  error.requestId = 'req_123';
  error.metadata = { operation: 'deploy' };
  error.attributes = { retryable: true };
  // @ts-expect-error authored message is readonly
  error.message = 'changed';
  // @ts-expect-error authored code is readonly
  error.code = 'cli_failure';
  // @ts-expect-error authored status is readonly
  error.statusCode = 500;
  // @ts-expect-error authored public details are readonly
  error.public = { message: 'changed' };
  // @ts-expect-error ErrorResponseData scope cannot be overridden during reconstruction
  fromErrorResponse(data, { scope: 'other' });
  // @ts-expect-error ErrorResponseData code cannot be overridden during reconstruction
  fromErrorResponse(data, { code: 'other' });
  // @ts-expect-error ErrorResponseData public details cannot be overridden during reconstruction
  fromErrorResponse(data, { public: { message: 'other' } });
}
assert(
  typeof verifyTypeContracts === 'function',
  'type contract fixture was not defined',
);

// @ts-expect-error custom subtypes require their matching ErrorClass
createErrors<'cli_failure', CliError>({ scope: 'cli' });
// @ts-expect-error reporting callbacks must be synchronous
createErrors({ onReport: async () => undefined });
// @ts-expect-error serialization callbacks must be synchronous
errorResponse({ message: 'Failed' }, { onSerialize: async () => undefined });

let serializedStatus: number | undefined;
let serializedBodyFormat: 'json' | 'ansi' | undefined;
const json: ErrorResponse = errorResponse(reported, {
  onSerialize: (_source, context) => {
    serializedBodyFormat = context.bodyFormat;
    serializedStatus = context.status;
  },
});
assert(json.status === 503, 'concrete status was not preserved');
assert(serializedStatus === 503, 'onSerialize did not run');
assert(serializedBodyFormat === 'json', 'JSON body format was not reported');
const parsedJson = parseErrorResponse(JSON.parse(json.body));
assert(parsedJson, 'valid JSON response did not parse');
const clientResponseData: ClientErrorResponseData = parsedJson;
assert(
  clientResponseData.error === parsedJson.error,
  'client response type alias changed response data',
);
assert(parsedJson.error.scope === 'visitor-signals', 'scope did not survive');
assert(parsedJson.error.code === 'unavailable', 'code did not survive');
assert(
  !('requestId' in parsedJson.error),
  'server-only requestId reached response data',
);

const reconstructed = fromErrorResponse(parsedJson, {
  statusCode: json.status,
});
assert(
  reconstructed.public?.message === 'Visitor signals are unavailable',
  'public details were not reconstructed',
);

const fallback = errorResponse(new VercelError('Secret developer prose'));
assert(
  JSON.parse(fallback.body).error.message === 'An error occurred.',
  'developer prose leaked through fallback',
);
for (const untaggedError of [
  new Error('Secret untagged developer prose'),
  new Proxy(new Error('Secret proxied developer prose'), {}),
]) {
  let untaggedErrorRejected = false;
  try {
    errorResponse(untaggedError);
  } catch (error) {
    untaggedErrorRejected = error instanceof TypeError;
  }
  assert(untaggedErrorRejected, 'untagged Error-like value was serialized');
}
const ansi = errorResponse(reported, {
  request: new Headers({ 'X-Error-Format': 'ansi' }),
});
assert(ansi.body.includes('\x1b['), 'explicit ANSI consulted ambient NO_COLOR');
assert(
  ansi.body.includes('Visitor signals are unavailable'),
  'ANSI output omitted public prose',
);
assert(
  !ansi.body.includes('Internal visitor failure'),
  'ANSI output disclosed developer prose',
);
assert(
  wantsAnsi(new Headers({ 'X-Error-Format': 'ansi' })),
  'server subpath negotiation failed',
);

assert(
  parseErrorResponse({ error: { hint: false, message: 'Failed' } }) ===
    undefined,
  'strict parsing accepted malformed known fields',
);
let invalidStatusRejected = false;
try {
  errorResponse({ message: 'Failed', statusCode: 399 });
} catch (error) {
  invalidStatusRejected = error instanceof RangeError;
}
assert(invalidStatusRejected, 'invalid status was not rejected');

assert(
  formatError(reconstructed, { format: 'plain' }).includes(
    'Visitor signals are unavailable',
  ),
  'format subpath could not render an error',
);
assert(
  frame('Failed', [hint('Try again'), fix('Retry'), link('https://x.dev')], {
    format: 'tree',
  }).includes('╰─▸'),
  'structured frame sections did not render',
);
