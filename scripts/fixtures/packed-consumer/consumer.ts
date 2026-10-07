import {
  VercelError,
  createErrors,
  hasCode,
  isErrorLike,
  isVercelError,
  type ErrorAttributes,
  type ErrorMetadata,
  type ErrorResponseData,
  type RecognizedVercelError,
  type VercelErrorLike,
  type VercelErrorOptions,
} from '@vercel/error';
import * as root from '@vercel/error';
import {
  fromErrorResponseData,
  fromHttpResponse,
  parseErrorResponseData,
  type ErrorResponseData as ClientErrorResponseData,
  type FromHttpResponseOptions,
} from '@vercel/error/client';
import { fix, formatError, frame, hint, link } from '@vercel/error/format';
import {
  buildErrorResponseData,
  errorResponse,
  wantsAnsi,
  type ErrorResponse,
  type ErrorResponseInput,
  type ErrorResponseData as ServerErrorResponseData,
  type ErrorResponseDataInput,
} from '@vercel/error/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  !('VERCEL_ERROR_TAG' in root),
  'the runtime recognition tag became a public export',
);

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
  public: { message: 'Public input failed' },
  statusCode: 400,
};
const publicResponse: ErrorResponse = errorResponse(publicInput);
assert(
  publicResponse.status === 400,
  'ErrorResponseInput status was not preserved in ErrorResponse',
);

const dataInput: ErrorResponseDataInput = {
  code: 'unavailable',
  scope: 'github',
  public: { message: 'We could not retrieve the GitHub issue.' },
};
const produced: ServerErrorResponseData = buildErrorResponseData(dataInput);
const decoded = parseErrorResponseData(JSON.parse(JSON.stringify(produced)));
assert(decoded, 'produced response data did not survive serialization');
const dataError = fromErrorResponseData(decoded);
assert(
  dataError.code === 'unavailable' &&
    dataError.scope === 'github' &&
    dataError.public?.message === 'We could not retrieve the GitHub issue.' &&
    dataError.statusCode === undefined,
  'data reconstruction did not preserve identity and public text or unexpectedly set a status',
);
const inheritedInput: ErrorResponseDataInput = publicInput;
assert(
  JSON.stringify(buildErrorResponseData(inheritedInput)) ===
    publicResponse.body,
  'HTTP input did not share the response data contract',
);
assert(
  JSON.stringify(buildErrorResponseData(reported)) ===
    errorResponse(reported).body,
  'tagged error data did not match HTTP JSON output',
);

function verifyDataInputContracts(input: ErrorResponseDataInput): void {
  // @ts-expect-error data input requires nested public details
  const missingPublic: ErrorResponseDataInput = {};
  // @ts-expect-error developer text cannot replace nested public details
  const flatInput: ErrorResponseDataInput = { message: 'Developer detail' };
  // @ts-expect-error authored identity is readonly
  input.code = 'changed';
  // @ts-expect-error authored public details are readonly
  input.public = { message: 'Changed' };
  assert(missingPublic && flatInput, 'invalid type fixtures were not defined');
}
assert(
  typeof verifyDataInputContracts === 'function',
  'data type fixture was not defined',
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
const directCustomError = new CliError('Direct custom error');
buildErrorResponseData(directCustomError);
errorResponse(directCustomError);
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
  // @ts-expect-error isErrorLike only guarantees message
  const inaccessibleName: unknown = unknownCliError.name;
  assert(inaccessibleName === 'CliError', 'runtime error name changed');
}
if (isVercelError(unknownCliError)) {
  const metadata: unknown = unknownCliError.metadata;
  assert(metadata === undefined, 'isVercelError narrowing failed');
  // @ts-expect-error cross-realm diagnostic contents are not validated
  const typedMetadata: ErrorMetadata | undefined = unknownCliError.metadata;
  assert(typedMetadata === undefined, 'cross-realm metadata type changed');
}
if (unknownCliError instanceof VercelError) {
  const metadata: ErrorMetadata | undefined = unknownCliError.metadata;
  assert(metadata === undefined, 'local VercelError metadata type changed');
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
  fromErrorResponseData(data, { scope: 'other' });
  // @ts-expect-error ErrorResponseData code cannot be overridden during reconstruction
  fromErrorResponseData(data, { code: 'other' });
  // @ts-expect-error ErrorResponseData public details cannot be overridden during reconstruction
  fromErrorResponseData(data, { public: { message: 'other' } });
}
assert(
  typeof verifyTypeContracts === 'function',
  'type contract fixture was not defined',
);

// @ts-expect-error custom subtypes require their matching ErrorClass
createErrors<'cli_failure', CliError>({ scope: 'cli' });
// @ts-expect-error reporting callbacks must be synchronous
createErrors({ onReport: async () => undefined });
errorResponse(
  { public: { message: 'Failed' } },
  {
    // @ts-expect-error serialization callbacks must be synchronous
    onSerialize: async () => undefined,
  },
);

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
const parsedJson = parseErrorResponseData(JSON.parse(json.body));
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

const reconstructed = fromErrorResponseData(parsedJson, {
  statusCode: json.status,
});
assert(
  reconstructed.public?.message === 'Visitor signals are unavailable',
  'public details were not reconstructed',
);

function verifyRecognizedProducerContracts(
  structural: VercelErrorLike,
  unknownError: unknown,
): void {
  const local = new VercelError('Local error');
  const inferredData: ServerErrorResponseData = buildErrorResponseData(local);
  const inferredResponse: ErrorResponse = errorResponse(local);
  const tagged: RecognizedVercelError = local;
  // @ts-expect-error recognition does not grant class methods
  tagged.toJSON();
  const unvalidatedAttributes: unknown = tagged.attributes;
  // @ts-expect-error recognized diagnostics stay unknown
  const typedAttributes: ErrorAttributes | undefined = tagged.attributes;
  buildErrorResponseData(tagged);
  errorResponse(tagged);
  buildErrorResponseData(reconstructed);
  errorResponse(reconstructed);
  formatError(new Error('Plain error'));
  formatError({ message: 'Structural fields remain formatable' });

  // @ts-expect-error ordinary Error is not a recognized producer input
  buildErrorResponseData(new Error('Plain error'));
  // @ts-expect-error ordinary Error is not a recognized producer input
  errorResponse(new Error('Plain error'));
  // @ts-expect-error flat message input does not make a disclosure decision
  buildErrorResponseData({ message: 'Developer detail' });
  // @ts-expect-error flat message input does not make a disclosure decision
  errorResponse({ message: 'Developer detail' });
  // @ts-expect-error explicit input requires public details
  buildErrorResponseData({});
  // @ts-expect-error explicit input requires public details
  errorResponse({});

  const decoratedError = Object.assign(new Error('Private'), {
    public: { message: 'Approved' },
  });
  // @ts-expect-error Error name and stack are not explicit input fields
  buildErrorResponseData(decoratedError);
  // @ts-expect-error Error name and stack are not explicit input fields
  errorResponse(decoratedError);
  // @ts-expect-error untagged name is excluded
  buildErrorResponseData({ public: { message: 'Approved' }, name: 'Custom' });
  // @ts-expect-error untagged name is excluded
  errorResponse({ public: { message: 'Approved' }, name: 'Custom' });
  // @ts-expect-error untagged stack is excluded
  buildErrorResponseData({ public: { message: 'Approved' }, stack: 'trace' });
  // @ts-expect-error untagged stack is excluded
  errorResponse({ public: { message: 'Approved' }, stack: 'trace' });

  const withTopLevelMessage = {
    message: 'Ignored developer detail',
    public: { message: 'Approved' },
  };
  buildErrorResponseData(withTopLevelMessage);
  errorResponse(withTopLevelMessage);

  // @ts-expect-error structural fields alone do not prove recognition
  buildErrorResponseData(structural);
  // @ts-expect-error structural fields alone do not prove recognition
  errorResponse(structural);
  if (isVercelError(structural)) {
    buildErrorResponseData(structural);
    errorResponse(structural);
  }
  if (hasCode(unknownError, 'unavailable')) {
    // @ts-expect-error a matching code alone does not prove recognition
    buildErrorResponseData(unknownError);
  }
  if (isVercelError(unknownError) && hasCode(unknownError, 'cli_failure')) {
    const narrowedCode: 'cli_failure' = unknownError.code;
    buildErrorResponseData(unknownError);
    errorResponse(unknownError);
    assert(narrowedCode === 'cli_failure', 'composed guard lost the code');
  }

  const callbackResponse = errorResponse(local, {
    onSerialize: (source) => {
      const callbackData: ServerErrorResponseData =
        buildErrorResponseData(source);
      assert(callbackData.error.message, 'onSerialize source was not accepted');
    },
  });
  assert(inferredData.error.message, 'builder return type changed');
  assert(inferredResponse.body, 'HTTP producer return type changed');
  assert(callbackResponse.body, 'serialization callback contract changed');
  assert(unvalidatedAttributes === undefined, 'diagnostics became validated');
  assert(typedAttributes === undefined, 'recognized diagnostics became typed');
}
assert(
  typeof verifyRecognizedProducerContracts === 'function',
  'recognized producer type fixture was not defined',
);

// oxlint-disable-next-line typescript-eslint/explicit-module-boundary-types -- declaration emission must infer this public recognized return type
export function makeInferredRecognizedError() {
  return new VercelError('Inferred public return type');
}

// oxlint-disable-next-line typescript-eslint/explicit-module-boundary-types -- declaration emission must infer the guard's public return type
export function narrowInferredRecognizedError(value: unknown) {
  return isVercelError(value) ? value : undefined;
}

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
    // Bypass the new producer type to retain a runtime rejection check.
    errorResponse(untaggedError as never);
  } catch (error) {
    untaggedErrorRejected = error instanceof TypeError;
  }
  assert(untaggedErrorRejected, 'untagged Error-like value was serialized');
}
const ansi = errorResponse(reported, {
  request: new Headers({ 'X-Error-Format': 'ansi' }),
});
assert(
  ansi.headers['Content-Type'] === 'text/plain+ansi; charset=utf-8' &&
    ansi.headers['Vary'] === 'X-Error-Format, Accept, User-Agent',
  'ANSI response has the wrong Content-Type or Vary',
);
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

const ansiByAccept = errorResponse(reported, {
  request: new Headers({ Accept: 'text/plain+ansi;q=0.5' }),
});
assert(
  ansiByAccept.headers['Content-Type'] === 'text/plain+ansi; charset=utf-8',
  'Accept q>0 did not select the ANSI Content-Type',
);
const declinedAnsi = errorResponse(reported, {
  request: new Headers({
    Accept: 'text/plain+ansi;q=0',
    'User-Agent': 'curl/8.1.2',
  }),
});
assert(
  declinedAnsi.headers['Content-Type'] === 'application/json' &&
    declinedAnsi.headers['Vary'] === 'X-Error-Format, Accept, User-Agent',
  'Accept q=0 did not select JSON with Vary',
);
const nativeAnsiResponse = new Response(ansiByAccept.body, ansiByAccept);
assert(
  nativeAnsiResponse.headers.get('Content-Type') ===
    'text/plain+ansi; charset=utf-8' &&
    nativeAnsiResponse.headers.get('Vary') ===
      'X-Error-Format, Accept, User-Agent',
  'native Response did not preserve ANSI headers',
);

assert(
  parseErrorResponseData({ error: { hint: false, message: 'Failed' } }) ===
    undefined,
  'strict parsing accepted malformed known fields',
);
let invalidStatusRejected = false;
try {
  errorResponse({ public: { message: 'Failed' }, statusCode: 399 });
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

async function verifyHttpResponseReader(
  response: Response,
  options?: FromHttpResponseOptions,
): Promise<void> {
  const error = await fromHttpResponse(response, options);
  if (error) {
    const statusCode: number | undefined = error.statusCode;
    assert(statusCode === response.status, 'response status was not preserved');
  }
}
assert(
  typeof verifyHttpResponseReader === 'function',
  'HTTP response reader type contract was not defined',
);
