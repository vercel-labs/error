import { VERCEL_ERROR_TAG } from '../constants';
import { formatAuto } from '../format/index';
import type {
  ErrorAttributes,
  ErrorMetadata,
  VercelErrorOptions,
} from '../types';

/**
 * Structured error class for Vercel.
 *
 * Every error should answer:
 * 1. **What** happened? → `message`
 * 2. **Why** did it happen? → `reason`
 * 3. **What** could help? → `hint`
 * 4. **How** to fix it? → `fix`
 * 5. **Where** to learn more? → `link`
 *
 * Key features:
 * - Zero runtime dependencies
 * - Human + agent readable context (`reason`, `hint`, `fix`, `link`, `userMessage`)
 * - Type-safe error codes via generics
 * - Separate `metadata` (domain context) and `attributes` (OTel observability)
 * - Error chaining with proper cause tracking
 * - Environment-aware `toString()` (auto-detects ANSI)
 * - Cross-realm compatibility via stable Symbol tag
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
  readonly code?: TCode;
  readonly scope?: string;

  statusCode?: number;

  reason?: string;
  hint?: string;
  fix?: string;
  link?: string;
  userMessage?: string;

  requestId?: string;
  metadata?: ErrorMetadata;
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
    this.userMessage = options.userMessage;
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
   * JSON representation for `JSON.stringify`.
   *
   * Surfaces non-enumerable Error properties (`name`, `message`, `stack`)
   * alongside all VercelError fields. Omits `cause` (may be circular or
   * contain sensitive internals) and any `undefined` values.
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
   * Environment-aware string representation.
   * Auto-detects ANSI support and renders accordingly.
   */
  override toString(): string {
    return formatAuto(this);
  }
}
