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
 * An `Error` subclass with stable identity, separate developer and public
 * details, an original cause, debugging data, and terminal formatting.
 *
 * `message`, `reason`, `hint`, `fix`, and `link` are developer-facing.
 * `errorResponse()` uses text from `public`, or a fixed generic message when
 * `public` is absent. When `public` is provided, its `message` must contain
 * non-whitespace text and its optional fields must be strings. Invalid fields
 * throw `TypeError`; unknown fields are dropped and the copied object is frozen.
 *
 * Objects from another JavaScript realm can carry the package symbol tag, but
 * any object can forge it. Use `instanceof VercelError` before calling class
 * methods.
 *
 * TypeScript exposes `requestId`, `metadata`, and `attributes` as writable and
 * the other fields declared below as readonly. This does not freeze the error
 * instance. Construction sets `name` to `"VercelError"`; subclasses that need
 * another stable name must assign it explicitly.
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
  /**
   * Developer-facing message. `errorResponse()` uses `public.message` or a
   * fixed generic message instead.
   */
  declare readonly message: string;

  /** Stable machine-readable code included by `errorResponse()` when defined. */
  readonly code?: TCode;
  /** Error scope included by `errorResponse()` when defined. */
  readonly scope?: string;

  /**
   * Status mapping used by `errorResponse()`. Omission defaults to 500; defined
   * values must be integers from 400 through 599.
   */
  readonly statusCode?: number;

  /** Developer-facing explanation of why the failure occurred. */
  readonly reason?: string;
  /** Developer-facing advice rendered before `fix`. */
  readonly hint?: string;
  /** Developer-facing recovery guidance; it does not authorize action. */
  readonly fix?: string;
  /**
   * Developer-facing documentation URL. Set `public.link` separately to
   * include a URL in an error response.
   */
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
   * Diagnostic object used by `JSON.stringify`.
   *
   * Surfaces non-enumerable Error properties (`name`, `message`, `stack`)
   * alongside all VercelError fields. Omits `cause` (may be circular or
   * contain sensitive internals) and any `undefined` values. This output may
   * contain developer-facing text and server data; use `errorResponse()` for
   * client-facing HTTP output.
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

  /**
   * Render the developer-facing message, identity, reason, hint, fix, and link
   * using environment-detected formatting. Use `errorResponse()` from
   * `@vercel/error/server` for client-facing HTTP output.
   */
  override toString(): string {
    return formatError(this, { format: 'auto' });
  }
}
