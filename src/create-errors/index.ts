import type {
  ErrorAttributes,
  ErrorMetadata,
  VercelErrorOptions,
} from '../types';
import { VercelError } from '../vercel-error';

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
  scope: string;
  ErrorClass?: ErrorConstructor<TCode, TError>;
  attributes?: ErrorAttributes;
  metadata?: ErrorMetadata;
  report?: (error: TError) => void;
}

/**
 * Create a scoped error namespace with type-safe error codes.
 *
 * Always returns `{ create, raise, report }`.
 * If no `report` callback is provided, `report` defaults to `console.error`.
 * If `ErrorClass` is provided, all errors are instances of that class.
 *
 * @example
 * ```ts
 * const errors = createErrors({
 *   scope: 'database',
 *   report: (error) => sentry.captureException(error),
 * });
 *
 * const error = errors.create('Connection failed', { code: 'conn_failed' });
 * errors.raise('Timeout', { code: 'timeout' }); // throws
 * errors.report('Pool exhausted', { code: 'pool_exhausted' }); // reports + returns
 * ```
 *
 * @example Custom error class
 * ```ts
 * class DatabaseError extends VercelError {
 *   readonly retryable = true;
 * }
 *
 * const errors = createErrors({
 *   scope: 'database',
 *   ErrorClass: DatabaseError,
 * });
 *
 * const err = errors.create('Pool exhausted'); // DatabaseError
 * err.retryable; // true — fully typed
 * ```
 */
export function createErrors<
  TCode extends string = string,
  TError extends VercelError<TCode> = VercelError<TCode>,
>(options: CreateErrorsOptions<TCode, TError>): ErrorFactory<TCode, TError> {
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

    const mergedOptions: VercelErrorOptions<TCode> = {
      ...itemOptions,
      attributes: mergedAttributes,
      metadata: mergedMetadata,
      scope: options.scope,
    };

    return new ErrorClass(message, mergedOptions);
  }

  return {
    create,
    raise(message: string, itemOptions?: CreateErrorOptions<TCode>): never {
      throw create(message, itemOptions);
    },
    report(message: string, itemOptions?: CreateErrorOptions<TCode>): TError {
      const error = create(message, itemOptions);
      reportFn(error);
      return error;
    },
  };
}
