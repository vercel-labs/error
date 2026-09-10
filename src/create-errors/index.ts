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
 * Per-error options. The factory supplies `scope`; `metadata` and `attributes`
 * merge over factory values, and an explicit `link` overrides `docsBaseUrl`.
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
 * Methods returned by {@link createErrors}: create, throw, or report an error.
 */
export interface ErrorFactory<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> {
  /** Create and return an error without reporting it. */
  create(message: string, options?: CreateErrorOptions<TCode>): TError;
  /** Create and throw an error without reporting it. */
  raise(message: string, options?: CreateErrorOptions<TCode>): never;
  /** Create, report, and return one error. Reporting errors propagate. */
  report(message: string, options?: CreateErrorOptions<TCode>): TError;
}

/**
 * Values shared by every error from {@link createErrors}. `ErrorClass` changes
 * the returned class. `onReport` runs only for `report` and defaults to
 * `console.error`.
 */
export interface CreateErrorsOptions<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
> {
  /** Scope assigned to every error; omission leaves it undefined. */
  scope?: string;

  /**
   * Base URL or function used to create a developer-facing `link` from `code`.
   * String bases lose trailing slashes before the unchanged code is appended.
   * An explicit per-error `link` wins. Set `public.link` separately for client
   * responses. Function errors propagate.
   */
  docsBaseUrl?: string | ((code: TCode) => string | undefined);

  /** Custom error class. Required when requesting a custom `TError`. */
  ErrorClass?: VercelErrorConstructor<TCode, TError>;
  /** Shared attributes; per-error keys win and responses exclude the result. */
  attributes?: ErrorAttributes;
  /** Shared metadata; per-error top-level keys win and responses exclude it. */
  metadata?: ErrorMetadata;

  /**
   * Called by `report` after creating the error. Exceptions propagate. Must
   * return `undefined`, so TypeScript rejects async callbacks.
   */
  onReport?: (error: TError) => undefined;
}

/**
 * Create a typed factory. `create` and `raise` do not report; `report` uses
 * `onReport` or `console.error`.
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
/** Create a factory returning `VercelError<TCode>` instances. */
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
