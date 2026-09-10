import { pickPublicErrorDetails } from '../_internal';
import { formatError } from '../format/index';
import type {
  ErrorAttributes,
  ErrorMetadata,
  PublicErrorDetails,
  VercelErrorOptions,
} from '../types';
import { VERCEL_ERROR_TAG } from './tag';

/**
 * An `Error` with stable identity and separate developer and client details.
 * Developer text stays outside `public`; construction validates and freezes
 * `public`. Use `instanceof VercelError` before calling methods on tagged data.
 * Only `requestId`, `metadata`, and `attributes` are writable in TypeScript.
 *
 * @template TCode - Strongly typed error code union
 *
 * @example
 * ```ts
 * throw new VercelError('Database connection pool exhausted', {
 *   code: 'pool_exhausted',
 *   scope: 'database',
 *   reason: 'All 20 connections are in use and none have been released.',
 *   hint: 'Consider using pgBouncer for connection pooling.',
 *   fix: 'Increase max_connections or add pgBouncer.',
 *   link: 'https://vercel.com/docs/storage/neon#connection-pooling',
 * });
 * ```
 */
export class VercelError<TCode extends string = string> extends Error {
  /** Developer message; responses use `public.message` or a generic message. */
  declare readonly message: string;

  /** Stable machine-readable code included by `errorResponse()` when defined. */
  readonly code?: TCode;
  /** Error scope included by `errorResponse()` when defined. */
  readonly scope?: string;

  /** HTTP status mapping; `errorResponse()` accepts 400-599 and defaults to 500. */
  readonly statusCode?: number;

  /** Developer-facing explanation of why the failure occurred. */
  readonly reason?: string;
  /** Developer-facing advice rendered before `fix`. */
  readonly hint?: string;
  /** Developer-facing recovery guidance; it does not authorize action. */
  readonly fix?: string;
  /** Developer URL; set `public.link` separately for responses. */
  readonly link?: string;
  /** Public error details, validated and copied at construction. */
  readonly public?: PublicErrorDetails;

  /** Mutable request ID included in `toJSON()` and excluded from responses. */
  requestId?: string;
  /** Mutable nested debugging data included in `toJSON()`, not responses. */
  metadata?: ErrorMetadata;
  /** Mutable flat telemetry values included in `toJSON()`, not responses. */
  attributes?: ErrorAttributes;

  constructor(message: string, options: VercelErrorOptions<TCode> = {}) {
    super(message, { cause: options.cause });

    this.name = 'VercelError';

    this.code = options.code;
    this.scope = options.scope;
    this.statusCode = options.statusCode;
    this.reason = options.reason;
    this.hint = options.hint;
    this.fix = options.fix;
    this.link = options.link;
    this.public =
      options.public === undefined
        ? undefined
        : Object.freeze(pickPublicErrorDetails(options.public));
    this.requestId = options.requestId;
    this.metadata = options.metadata;
    this.attributes = options.attributes;

    Object.defineProperty(this, VERCEL_ERROR_TAG, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  }

  private static readonly JSON_EXCLUDE = new Set(['name', 'cause']);

  /**
   * Object used by `JSON.stringify`. Includes `name`, `message`, `stack`, and
   * defined `VercelError` fields, but not `cause`. May contain developer and
   * server data; use `errorResponse()` for client output.
   */
  toJSON(): Record<string, unknown> {
    return {
      message: this.message,
      name: this.name,
      ...(this.stack ? { stack: this.stack } : {}),
      ...Object.fromEntries(
        Object.entries(this).filter(
          ([key, value]) =>
            !VercelError.JSON_EXCLUDE.has(key) && value !== undefined,
        ),
      ),
    };
  }

  /** Render developer fields; use `errorResponse()` for client-facing output. */
  override toString(): string {
    return formatError(this, { format: 'auto' });
  }
}
