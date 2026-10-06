import * as root from '@vercel/error';
import * as client from '@vercel/error/client';
import * as format from '@vercel/error/format';
import * as server from '@vercel/error/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

for (const nodeGlobal of ['process', 'Buffer', 'require']) {
  assert(
    !(nodeGlobal in globalThis),
    'Node VM sandbox unexpectedly exposes global ' + nodeGlobal,
  );
}

const runtimeExports = {
  '.': root,
  './client': client,
  './format': format,
  './server': server,
};
(
  globalThis as typeof globalThis & {
    __vercelErrorRuntimeExportKeys?: Record<string, string[]>;
  }
).__vercelErrorRuntimeExportKeys = Object.fromEntries(
  Object.entries(runtimeExports).map(([subpath, exports]) => [
    subpath,
    Object.keys(exports),
  ]),
);

assert(
  root.isError(new Error('browser failure')),
  'isError did not recognize an Error created in the Node VM',
);
const acceptsTagForgery = (
  globalThis as typeof globalThis & {
    __vercelErrorAcceptsTagForgery: boolean;
  }
).__vercelErrorAcceptsTagForgery;
assert(
  root.isError({ [Symbol.toStringTag]: 'Error' }) === acceptsTagForgery,
  'isError did not select the expected recognition branch',
);

const error = new root.VercelError('DEV_MESSAGE', {
  code: 'unavailable',
  public: { message: 'We could not retrieve the GitHub issue.' },
  scope: 'github',
  statusCode: 503,
});

const data: server.ErrorResponseData = server.buildErrorResponseData(error);
const dataInput: server.ErrorResponseDataInput = {
  public: { message: 'Explicit data input' },
};
assert(
  server.buildErrorResponseData(dataInput).error.message ===
    'Explicit data input',
  'browser bundle could not build explicit response data',
);
const parsedData = client.parseErrorResponseData(
  JSON.parse(JSON.stringify(data)),
);
assert(parsedData, 'browser bundle could not parse produced data');
const dataError = client.fromErrorResponseData(parsedData);
assert(
  dataError.code === 'unavailable' &&
    dataError.scope === 'github' &&
    dataError.public?.message === 'We could not retrieve the GitHub issue.' &&
    dataError.statusCode === undefined &&
    !JSON.stringify(data).includes('DEV_MESSAGE'),
  'browser data round trip changed public fields or disclosed diagnostics',
);

const json = server.errorResponse(error);
assert(
  json.status === 503,
  'errorResponse did not map statusCode 503 to response status 503',
);
assert(
  !json.body.includes('DEV_MESSAGE'),
  'JSON response contains the developer message',
);
const ansiRequest = {
  get(name: string) {
    return name.toLowerCase() === 'x-error-format' ? 'ansi' : null;
  },
};
const ansi = server.errorResponse(error, { request: ansiRequest });
assert(
  ansi.headers['Content-Type'] === 'text/plain+ansi; charset=utf-8' &&
    ansi.headers.Vary === 'X-Error-Format, Accept, User-Agent' &&
    ansi.body.includes('\x1b['),
  'browser bundle returned the wrong ANSI body or headers',
);
const jsonRequest = {
  get(name: string) {
    return name.toLowerCase() === 'accept' ? 'text/plain+ansi;q=0' : null;
  },
};
const variedJson = server.errorResponse(error, { request: jsonRequest });
assert(
  variedJson.headers['Content-Type'] === 'application/json' &&
    variedJson.headers.Vary === 'X-Error-Format, Accept, User-Agent',
  'browser bundle did not select JSON with Vary for q=0',
);
const explicitPublic = server.errorResponse({
  public: { message: 'Explicit public input' },
  statusCode: 400,
});
assert(
  explicitPublic.status === 400 &&
    JSON.parse(explicitPublic.body).error.message === 'Explicit public input',
  'nested public input failed in the browser bundle',
);
const parsed = client.parseErrorResponseData(JSON.parse(json.body));
assert(
  parsed?.error.code === 'unavailable' &&
    parsed.error.scope === 'github' &&
    parsed.error.message === 'We could not retrieve the GitHub issue.',
  'browser-platform bundle response did not preserve its public identity and message',
);
const reconstructed = client.fromErrorResponseData(parsed, {
  statusCode: json.status,
});
const reconstructedResponse = server.errorResponse(reconstructed);
assert(
  reconstructedResponse.status === json.status &&
    reconstructedResponse.body === json.body,
  'reconstructed error did not serialize to the same public body',
);
assert(
  format
    .formatError(reconstructed, { format: 'plain' })
    .includes('We could not retrieve the GitHub issue.'),
  'plain format omitted the reconstructed public message',
);

(
  globalThis as typeof globalThis & {
    __vercelErrorBrowserCheckComplete?: boolean;
  }
).__vercelErrorBrowserCheckComplete = true;
