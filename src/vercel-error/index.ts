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
 * An Error subclass with stable identity, separate developer and public details,
 * diagnostic context, cause chaining, and terminal formatting.
 *
 * `message` is required. `reason`, `hint`, `fix`, and `link` are optional
 * developer details; omit them when the cause or remediation is not known.
 * When `public` is supplied, construction validates it (nonblank string
 * `message`, optional string details), drops unknown fields, and stores a
 * frozen copy; invalid `public` details throw `TypeError` here rather than
 * later at serialization. Cross-realm recognition is data-only because the
 * symbol tag is forgeable; use `instanceof VercelError` before invoking class
 * methods. Construction sets `name` to `"VercelError"`; subclasses must assign
 * a different stable name explicitly. Identity and prose fields are readonly,
 * while `requestId`, `metadata`, and `attributes` remain mutable for diagnostic
 * enrichment.
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
  /** Developer-facing description of what failed; not approved for clients. */
  declare readonly message: string;

  /** Stable machine-readable identity sent to clients when defined. */
  readonly code?: TCode;
  /** Optional identity namespace sent to clients when defined. */
  readonly scope?: string;

  /**
   * Authored HTTP mapping. `errorResponse()` defaults omission to 500 and
   * accepts only integers from 400 through 599.
   */
  readonly statusCode?: number;

  /** Developer-facing explanation of why the failure occurred. */
  readonly reason?: string;
  /** Developer-facing advisory guidance rendered before `fix`. */
  readonly hint?: string;
  /** Developer-facing remediation suggestion; it does not authorize action. */
  readonly fix?: string;
  /** Developer-facing documentation URL; not automatically safe for clients. */
  readonly link?: string;
  /**
   * Client-approved details, validated and copied at construction. Unknown
   * fields are dropped and the stored copy is frozen.
   */
  readonly public?: PublicErrorDetails;

  /** Mutable correlation value included in diagnostics but never responses. */
  requestId?: string;
  /** Mutable nested diagnostic context included in `toJSON()`, never responses. */
  metadata?: ErrorMetadata;
  /** Mutable flat telemetry context included in `toJSON()`, never responses. */
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
   * contain developer prose and server context; use `errorResponse()` for
   * client-safe HTTP serialization.
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
   * Render developer-facing details with environment-detected formatting.
   * This output may contain sensitive diagnostics; use `errorResponse()` for
   * client-safe HTTP serialization.
   */
  override toString(): string {
    return formatError(this, { format: 'auto' });
  }
}
