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
 * Per-error options passed to create/raise/report.
 * `scope` is omitted because it's the factory's identity.
 */
export type CreateErrorOptions<TCode extends string = string> = Omit<
  VercelErrorOptions<TCode>,
  'scope'
>;

/**
 * Constructor constraint for custom error classes.
 * Any class that extends VercelError and accepts `(message, options?)` is valid.
 */
export type ErrorConstructor<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> = new (message: string, options?: VercelErrorOptions<TCode>) => TError;

export interface ErrorFactory<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> {
  create(message: string, options?: CreateErrorOptions<TCode>): TError;
  raise(message: string, options?: CreateErrorOptions<TCode>): never;
  report(message: string, options?: CreateErrorOptions<TCode>): TError;
}

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
   * `"https://vercel.com/docs/errors/pool_exhausted"`). The code is not
   * transformed, so use a function base if you need to change its case or shape.
   * When a function, it receives the `code` and returns a URL, or `undefined`
   * to skip.
   *
   * Applied only when an error has a `code` and no explicit `link`. A
   * per-error `link` always wins.
   */
  docsBaseUrl?: string | ((code: TCode) => string | undefined);

  ErrorClass?: ErrorConstructor<TCode, TError>;
  attributes?: ErrorAttributes;
  metadata?: ErrorMetadata;
  report?: (error: TError) => void;
}

/**
 * Create an error factory with type-safe error codes.
 *
 * Always returns `{ create, raise, report }`.
 * `scope` is optional. Provide it only when you want to group errors by a
 * namespace. When `docsBaseUrl` is set, each error's `link` is derived from
 * its `code`, unless you pass an explicit `link`.
 * When no `report` callback is provided, `report` defaults to `console.error`.
 * When `ErrorClass` is provided, all errors are instances of that class.
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
 *   report: (error) => sentry.captureException(error),
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
  options: CreateErrorsOptions<TCode, TError> = {},
): ErrorFactory<TCode, TError> {
  const ErrorClass = (options.ErrorClass ?? VercelError) as ErrorConstructor<
    TCode,
    TError
  >;
  const reportFn = options.report ?? ((error: TError) => console.error(error));

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
    reportFn(error);
    return error;
  }

  return {
    create,
    raise,
    report,
  };
}
