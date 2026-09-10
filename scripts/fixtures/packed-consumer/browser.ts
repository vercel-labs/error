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
  './server': server,
  './format': format,
};
(
  globalThis as typeof globalThis & {
    __vercelErrorExercisedExports?: Record<string, string[]>;
  }
).__vercelErrorExercisedExports = Object.fromEntries(
  Object.entries(runtimeExports).map(([subpath, exports]) => [
    subpath,
    Object.keys(exports).toSorted(),
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
  public: { message: 'The service is unavailable' },
  scope: 'browser',
  statusCode: 503,
});

const json = server.errorResponse(error);
assert(
  json.status === 503,
  'errorResponse did not map statusCode 503 to response status 503',
);
assert(
  !json.body.includes('DEV_MESSAGE'),
  'JSON response contains the developer message',
);
const parsed = client.parseErrorResponse(JSON.parse(json.body));
assert(
  parsed?.error.code === 'unavailable' &&
    parsed.error.message === 'The service is unavailable',
  'browser response did not preserve its public identity and message',
);
const reconstructed = client.fromErrorResponse(parsed, {
  statusCode: json.status,
});
assert(
  server.errorResponse(reconstructed).body === json.body,
  'reconstructed error did not serialize to the same public body',
);
assert(
  format
    .formatError(reconstructed, { format: 'plain' })
    .includes('The service is unavailable'),
  'plain format omitted the reconstructed public message',
);

(
  globalThis as typeof globalThis & {
    __vercelErrorBrowserCheckComplete?: boolean;
  }
).__vercelErrorBrowserCheckComplete = true;
