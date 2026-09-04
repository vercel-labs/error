import { fix, frame, hint, link } from '../format/index';
import { isVercelError } from '../is-vercel-error';
import type { ErrorResponse, HeadersLike } from '../types';
import type { VercelError } from '../vercel-error';
import { wantsAnsi } from '../wants-ansi';

/**
 * Plain error parameters for building a response without a VercelError instance.
 */
export interface ErrorResponseParams {
  /** HTTP status code for the response. Defaults to 500. */
  status?: number;
  /** Stable, machine-readable identifier for this error. */
  code?: string;
  /** Client-safe message describing what happened. */
  message: string;
  /** Why the error happened, the root-cause explanation. */
  reason?: string;
  /** Advisory tip that helps the developer, shown before `fix`. */
  hint?: string;
  /** Actionable step that resolves the error. */
  fix?: string;
  /** URL to documentation for this error. */
  link?: string;
}

export interface ErrorResponseResult {
  /** HTTP status code to send. */
  status: number;
  /** Serialized response body, either JSON or structured text. */
  body: string;
  /** Content-Type and any other headers to spread into the response. */
  headers: Record<string, string>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' } as const;

/**
 * Build a complete HTTP error response from a VercelError or plain parameters.
 *
 * Returns `{ status, body, headers }`. Spread `headers` directly into your
 * framework's response constructor. Content negotiation is handled internally
 * when a request or headers object is provided.
 *
 * JSON output from a VercelError uses `userMessage` or falls back to `message`.
 * ANSI output uses `toString()` and may include the developer-facing
 * `message`, `reason`, `hint`, `fix`, and `link`. Request headers select the
 * format; they do not authorize access. Pass them only for callers allowed to
 * see those fields. Omitting headers disables ANSI negotiation, but every JSON
 * field must still be client-safe.
 *
 * @param error - A VercelError instance or plain `{ message, code?, status? }` params
 * @param requestOrHeaders - Optional Request or HeadersLike for content negotiation.
 *   When present and the client signals ANSI preference (curl, `X-Error-Format: ansi`),
 *   the body is rendered as structured text. When absent, always returns JSON.
 *
 * @example
 * ```ts
 * // Minimal: always JSON
 * const { status, body, headers } = errorResponse(error);
 * return new Response(body, { status, headers });
 *
 * // With content negotiation
 * const { status, body, headers } = errorResponse(error, req);
 * return new Response(body, { status, headers });
 *
 * // Express
 * const { status, body, headers } = errorResponse(error, req);
 * res.status(status).set(headers).send(body);
 * ```
 */
export function errorResponse(
  error: VercelError | ErrorResponseParams,
  requestOrHeaders?: Request | HeadersLike,
): ErrorResponseResult {
  const data = extractResponseData(error);

  if (wantsAnsi(requestOrHeaders)) {
    const text = isVercelError(error)
      ? error.toString()
      : frame(buildPlainHeader(data.error), [
          data.error.reason,
          hint(data.error.hint),
          fix(data.error.fix),
          link(data.error.link),
        ]);

    return {
      body: text,
      headers: { ...TEXT_HEADERS },
      status: data.status,
    };
  }

  return {
    body: JSON.stringify({ error: data.error }),
    headers: { ...JSON_HEADERS },
    status: data.status,
  };
}

interface ExtractedData {
  status: number;
  error: ErrorResponse['error'];
}

function buildPlainHeader(error: ErrorResponse['error']): string {
  if (!error.message) {
    return error.code ? `error: [${error.code}]` : 'error:';
  }
  return error.code
    ? `error: [${error.code}] ${error.message}`
    : `error: ${error.message}`;
}

interface WireMessageParts {
  message: string;
  scope?: string;
  code?: string;
}

/**
 * Resolve the client-facing wire message. After production stripping the
 * message can be empty, so fall back to a `[scope:code]` identifier built from
 * whatever structured fields survive. The wire format omits `scope`, so it is
 * folded into the message here.
 */
function resolveWireMessage({
  message,
  scope,
  code,
}: WireMessageParts): string {
  if (message) return message;
  const qualifier = [scope, code].filter(Boolean).join(':');
  return qualifier ? `[${qualifier}]` : '';
}

function extractResponseData(
  error: VercelError | ErrorResponseParams,
): ExtractedData {
  if (isVercelError(error)) {
    return {
      error: {
        message: resolveWireMessage({
          message: error.userMessage ?? error.message,
          scope: error.scope,
          code: error.code,
        }),
        ...(error.code ? { code: error.code } : {}),
        ...(error.reason ? { reason: error.reason } : {}),
        ...(error.hint ? { hint: error.hint } : {}),
        ...(error.fix ? { fix: error.fix } : {}),
        ...(error.link ? { link: error.link } : {}),
      },
      status: error.statusCode ?? 500,
    };
  }

  return {
    error: {
      message: resolveWireMessage({ message: error.message, code: error.code }),
      ...(error.code ? { code: error.code } : {}),
      ...(error.reason ? { reason: error.reason } : {}),
      ...(error.hint ? { hint: error.hint } : {}),
      ...(error.fix ? { fix: error.fix } : {}),
      ...(error.link ? { link: error.link } : {}),
    },
    status: error.status ?? 500,
  };
}
