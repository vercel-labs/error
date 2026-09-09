/**
 * Recursive type for structured metadata values, allowing arbitrarily nested
 * domain context.
 */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };

/**
 * Domain-specific structured context for debugging and logging.
 * Can contain arbitrarily nested values. Server-side only, so it is excluded
 * from HTTP error responses.
 *
 * Use in internal diagnostic serialization, logging, and debugging tools.
 *
 * @example { userId: '123', query: { table: 'users', limit: 50 } }
 */
export type ErrorMetadata = Record<string, SerializableValue>;

/**
 * Flat key-value pairs for observability and telemetry.
 * Compatible with OpenTelemetry's AttributeValue type.
 *
 * Route to: tracing spans, Sentry tags, metrics dashboards.
 *
 * @example { 'http.method': 'POST', 'db.system': 'postgresql', 'retry.count': 3 }
 */
export type ErrorAttributes = Record<
  string,
  string | number | boolean | string[] | number[] | boolean[] | undefined
>;

/**
 * Minimal interface for error-like objects with a message property.
 */
export interface ErrorLike {
  message: string;
  name?: string;
  stack?: string;
}

/**
 * Error details explicitly approved for disclosure to clients.
 *
 * `message` is required and must be nonblank; optional fields must be
 * strings. The `VercelError` constructor validates these rules, and
 * `errorResponse()` re-validates flat and tagged cross-realm input at
 * serialization; invalid details throw `TypeError`. This prevents transport
 * serialization from falling back to developer-facing prose. Applications
 * remain responsible for ensuring every supplied field is safe for the
 * intended audience.
 */
export interface PublicErrorDetails {
  readonly message: string;
  readonly reason?: string;
  readonly hint?: string;
  readonly fix?: string;
  readonly link?: string;
}

/**
 * Configuration options for creating a VercelError instance.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /** Flat OTel-compatible tags for traces, metrics, and error trackers. */
  attributes?: ErrorAttributes;

  /** The underlying error or value that triggered this one, for chaining. */
  readonly cause?: unknown;

  /**
   * Stable, machine-readable identifier for this error. Keep it constant even
   * when you reword the message, so users can search it and docs can link to
   * it. Pick whatever style fits your registry: semantic names
   * (`pool_exhausted`), numeric codes (`E1001`), or namespaced numbers
   * (`B2011`). Numbering is optional, so use words when you prefer them.
   */
  readonly code?: TCode;

  /** Known developer remediation and any required precondition. It suggests an action but does not authorize it. */
  readonly fix?: string;

  /** Advisory tip that helps the developer, shown before `fix`. */
  readonly hint?: string;

  /** URL to documentation for this error. A `createErrors` factory with `docsBaseUrl` derives it from `code`. */
  readonly link?: string;

  /** Nested domain context for debugging and logging. Never sent to clients. */
  metadata?: ErrorMetadata;

  /** Why the error happened, the root-cause explanation behind the message. */
  readonly reason?: string;

  /** Correlation ID for tracing this error across services. */
  requestId?: string;

  /** Namespace that produced the error, such as a service or subsystem. */
  readonly scope?: string;

  /**
   * Authored HTTP status mapping. `errorResponse()` accepts integers from 400
   * through 599, defaults omission to 500, and throws `RangeError` otherwise.
   */
  readonly statusCode?: number;

  /**
   * Details explicitly approved for client disclosure. Construction validates
   * the fields (nonblank string `message`, optional string details), throws
   * `TypeError` for invalid values, drops unknown fields, and stores a frozen
   * copy so later mutation of the input object cannot change them.
   */
  readonly public?: PublicErrorDetails;

  /** Reserved. Automatically captured from Error. */
  readonly stack?: never;
  /** Reserved. Pass message as the first constructor argument. */
  readonly message?: never;
  /** Reserved. Hardcoded to "VercelError" for minification safety. */
  readonly name?: never;
}

/**
 * Data contract recognized by {@link isVercelError} across realms.
 *
 * The stable symbol tag used for recognition is forgeable. This interface is
 * suitable for reading data fields, not for authenticating the producer,
 * authorizing disclosure, or invoking local class methods.
 */
export interface VercelErrorLike<
  TCode extends string = string,
> extends ErrorLike {
  readonly cause?: unknown;
  readonly code?: TCode;
  readonly scope?: string;
  readonly statusCode?: number;
  readonly reason?: string;
  readonly hint?: string;
  readonly fix?: string;
  readonly link?: string;
  readonly public?: PublicErrorDetails;
  requestId?: string;
  metadata?: ErrorMetadata;
  attributes?: ErrorAttributes;
}
