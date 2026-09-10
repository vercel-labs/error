import type {
  ErrorAttributes,
  ErrorMetadata,
  VercelErrorOptions,
} from '../types';
import { VercelError } from '../vercel-error';

/**
 * Resolve a documentation URL for a code from a base URL.
 * A string base appends the code verbatim as a path segment. A function
 * base is called with the code. Returns `undefined` when no URL applies.
 */
function resolveDocsUrl<TCode extends string>(
  docsBaseUrl: string | ((code: TCode) => string | undefined) | undefined,
  code: TCode,
): string | undefined {
  if (!docsBaseUrl) return undefined;
  if (typeof docsBaseUrl === 'function') return docsBaseUrl(code);
  return `${docsBaseUrl.replace(/\/+$/, '')}/${code}`;
}

/**
 * Options accepted by `create`, `raise`, and `report`.
 *
 * `createErrors` supplies `scope`, so callers cannot set it per error.
 * Per-error `metadata` and `attributes` shallow-merge over factory defaults.
 * An explicit per-error `link` overrides a link derived from `docsBaseUrl`.
 */
export type CreateErrorOptions<TCode extends string = string> = Omit<
  VercelErrorOptions<TCode>,
  'scope'
>;

/**
 * Type accepted for a custom error class. The class must extend `VercelError`
 * and accept `(message, options?)`.
 */
export type VercelErrorConstructor<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> = new (message: string, options?: VercelErrorOptions<TCode>) => TError;

/**
 * Typed methods returned by {@link createErrors}.
 *
 * `create` returns an error without reporting, `raise` throws without
 * reporting, and `report` creates one error, calls `onReport`, then returns it.
 */
export interface ErrorFactory<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> {
  /** Create and return an error without reporting it. */
  create(message: string, options?: CreateErrorOptions<TCode>): TError;
  /** Create and throw an error without reporting it. */
  raise(message: string, options?: CreateErrorOptions<TCode>): never;
  /**
   * Create an error, report it synchronously through `onReport` or
   * `console.error`, then return the same error. If reporting throws, this
   * method does not return.
   */
  report(message: string, options?: CreateErrorOptions<TCode>): TError;
}

/**
 * Values and behavior shared by every error from {@link createErrors}.
 *
 * A supplied `ErrorClass` determines the returned subtype. `onReport` runs only
 * for `report`; omission defaults that method to `console.error`.
 */
export interface CreateErrorsOptions<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> {
  /**
   * Namespace injected into every error this factory produces.
   * Optional. Provide it only when a scope is useful, such as grouping errors
   * by service or subsystem. When omitted, errors have no `scope`.
   */
  scope?: string;

  /**
   * Base URL or resolver for documentation links. When a string, the error's
   * `code` is appended verbatim as a path segment
   * (e.g. `"https://vercel.com/docs/errors"` plus code `"pool_exhausted"` gives
   * `"https://vercel.com/docs/errors/pool_exhausted"`). Trailing slashes on a
   * string base are trimmed before joining. The code is not transformed, so
   * use a function base if you need to change its case or shape.
   * When a function, it receives the `code` and returns a URL, or `undefined`
   * to skip.
   *
   * Applied only when an error has a `code` and no explicit `link`. A
   * per-error `link` always wins. This sets only the developer-facing `link`;
   * set `public.link` separately for client responses. Resolver
   * exceptions propagate from `create`, `raise`, or `report`.
   */
  docsBaseUrl?: string | ((code: TCode) => string | undefined);

  /** Custom error class. Required when requesting a custom `TError`. */
  ErrorClass?: VercelErrorConstructor<TCode, TError>;
  /**
   * Factory-wide OpenTelemetry-compatible values. Per-error values replace
   * factory values with the same keys. The merged attributes are excluded from
   * error responses.
   */
  attributes?: ErrorAttributes;
  /**
   * Factory-wide nested debugging data. Per-error keys replace factory values
   * with the same top-level keys. The merged data is excluded from responses.
   */
  metadata?: ErrorMetadata;

  /**
   * Called synchronously after `report` creates an error. It is not called by
   * `create` or `raise`. Exceptions propagate. The callback must return
   * `undefined`, so TypeScript rejects async callbacks.
   */
  onReport?: (error: TError) => undefined;
}

/**
 * Create an error factory with type-safe error codes.
 *
 * Always returns `{ create, raise, report }`.
 * `scope` is optional. Provide it only when you want to group errors by a
 * namespace. When `docsBaseUrl` is set, each error's `link` is derived from
 * its `code`, unless you pass an explicit `link`.
 * When no `onReport` callback is provided, `report` defaults to `console.error`.
 * When `ErrorClass` is provided, all errors are instances of that class.
 * `create` and `raise` never report automatically.
 *
 * @example
 * ```ts
 * class DatabaseError extends VercelError {
 *   readonly retryable = true;
 * }
 *
 * const errors = createErrors({
 *   scope: 'database',
 *   ErrorClass: DatabaseError,
 *   docsBaseUrl: 'https://vercel.com/docs/errors/database',
 *   onReport: (error) => {
 *     sentry.captureException(error);
 *   },
 * });
 *
 * const error = errors.create('Connection failed', { code: 'conn_failed' });
 * error.retryable; // true, fully typed
 * error.link; // 'https://vercel.com/docs/errors/database/conn_failed'
 *
 * errors.raise('Timeout', { code: 'timeout' }); // throws
 * errors.report('Pool exhausted', { code: 'pool_exhausted' }); // reports + returns
 * ```
 */
export function createErrors<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
>(
  options: CreateErrorsOptions<TCode, TError> & {
    readonly ErrorClass: VercelErrorConstructor<TCode, TError>;
  },
): ErrorFactory<TCode, TError>;
/**
 * Create a factory that returns `VercelError<TCode>` instances. Options are
 * optional; without `onReport`, `report()` uses `console.error`.
 */
export function createErrors<TCode extends string = string>(
  options?: CreateErrorsOptions<TCode, VercelError<TCode>>,
): ErrorFactory<TCode, VercelError<TCode>>;
export function createErrors<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
>(
  options: CreateErrorsOptions<TCode, TError> = {},
): ErrorFactory<TCode, TError> {
  const ErrorClass = (options.ErrorClass ??
    VercelError) as VercelErrorConstructor<TCode, TError>;
  const onReport =
    options.onReport ??
    ((error: TError): undefined => {
      console.error(error);
    });

  function create(
    message: string,
    itemOptions: CreateErrorOptions<TCode> = {},
  ): TError {
    const mergedAttributes =
      options.attributes || itemOptions.attributes
        ? { ...options.attributes, ...itemOptions.attributes }
        : undefined;

    const mergedMetadata =
      options.metadata || itemOptions.metadata
        ? { ...options.metadata, ...itemOptions.metadata }
        : undefined;

    const link =
      itemOptions.link ??
      (itemOptions.code !== undefined
        ? resolveDocsUrl(options.docsBaseUrl, itemOptions.code)
        : undefined);

    const mergedOptions: VercelErrorOptions<TCode> = {
      ...itemOptions,
      attributes: mergedAttributes,
      metadata: mergedMetadata,
      link,
      scope: options.scope,
    };

    return new ErrorClass(message, mergedOptions);
  }

  function raise(
    message: string,
    itemOptions?: CreateErrorOptions<TCode>,
  ): never {
    throw create(message, itemOptions);
  }

  function report(
    message: string,
    itemOptions?: CreateErrorOptions<TCode>,
  ): TError {
    const error = create(message, itemOptions);
    onReport(error);
    return error;
  }

  return {
    create,
    raise,
    report,
  };
}
