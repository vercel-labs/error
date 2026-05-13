import { frame, hint, fix, link } from '../format/index';
import { isVercelError } from '../is-vercel-error';
import type { ErrorResponse, HeadersLike } from '../types';
import type { VercelError } from '../vercel-error';
import { wantsAnsi } from '../wants-ansi';

/**
 * Plain error parameters for building a response without a VercelError instance.
 */
export interface ErrorResponseParams {
  status?: number;
  code?: string;
  message: string;
  reason?: string;
  hint?: string;
  fix?: string;
  link?: string;
}

export interface ErrorResponseResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' } as const;

/**
 * Build a complete HTTP error response from a VercelError or plain parameters.
 *
 * Returns `{ status, body, headers }` — spread `headers` directly into your
 * framework's response constructor. Content negotiation is handled internally
 * when a request or headers object is provided.
 *
 * When given a VercelError, uses `userMessage` for the client-facing output.
 * Falls back to `message` if `userMessage` is not set.
 *
 * @param error - A VercelError instance or plain `{ message, code?, status? }` params
 * @param requestOrHeaders - Optional Request or HeadersLike for content negotiation.
 *   When present and the client signals ANSI preference (curl, `X-Error-Format: ansi`),
 *   the body is rendered as structured text. When absent, always returns JSON.
 *
 * @example
 * ```ts
 * // Minimal — always JSON
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
      status: data.status,
      body: text,
      headers: { ...TEXT_HEADERS },
    };
  }

  return {
    status: data.status,
    body: JSON.stringify({ error: data.error }),
    headers: { ...JSON_HEADERS },
  };
}

interface ExtractedData {
  status: number;
  error: ErrorResponse['error'];
}

function buildPlainHeader(error: ErrorResponse['error']): string {
  return error.code
    ? `error: [${error.code}] ${error.message}`
    : `error: ${error.message}`;
}

function extractResponseData(
  error: VercelError | ErrorResponseParams,
): ExtractedData {
  if (isVercelError(error)) {
    return {
      status: error.statusCode ?? 500,
      error: {
        message: error.userMessage ?? error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.reason ? { reason: error.reason } : {}),
        ...(error.hint ? { hint: error.hint } : {}),
        ...(error.fix ? { fix: error.fix } : {}),
        ...(error.link ? { link: error.link } : {}),
      },
    };
  }

  return {
    status: error.status ?? 500,
    error: {
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.reason ? { reason: error.reason } : {}),
      ...(error.hint ? { hint: error.hint } : {}),
      ...(error.fix ? { fix: error.fix } : {}),
      ...(error.link ? { link: error.link } : {}),
    },
  };
}
