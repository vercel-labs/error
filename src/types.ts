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
 * When attached to `VercelError`, attributes appear in diagnostic `toJSON()`
 * output but never in `ErrorResponseData` or HTTP response bodies.
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
  /** Required string inspected by {@link isErrorLike}; blank strings pass. */
  message: string;
  /** Optional descriptive error name; {@link isErrorLike} does not inspect it. */
  name?: string;
  /** Optional diagnostic stack; {@link isErrorLike} does not inspect it. */
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
  /** Required nonblank description explicitly approved for clients. */
  readonly message: string;
  /** Optional client-approved explanation of why the error occurred. */
  readonly reason?: string;
  /** Optional client-approved advisory guidance. */
  readonly hint?: string;
  /** Optional client-approved remediation suggestion, not authorization. */
  readonly fix?: string;
  /** Optional client-approved URL; it does not establish trust or authority. */
  readonly link?: string;
}

/**
 * Configuration options for creating a VercelError instance.
 *
 * `reason`, `hint`, `fix`, and `link` are developer-facing. Client prose must
 * be supplied separately under `public`. `scope`, `code`, and the resulting
 * HTTP status are also client-visible when an error becomes a response.
 * `cause`, `requestId`, `metadata`, and `attributes` remain diagnostic only.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /**
   * Flat OTel-compatible telemetry values. Stored by reference and never sent
   * in error responses.
   */
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

  /**
   * Nested domain context for debugging and logging. Stored by reference and
   * never sent to clients.
   */
  metadata?: ErrorMetadata;

  /** Why the error happened, the root-cause explanation behind the message. */
  readonly reason?: string;

  /** Diagnostic correlation ID for tracing. Never sent in error responses. */
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
  /** Underlying diagnostic value; not sent in error responses. */
  readonly cause?: unknown;
  /** Stable identity code sent to clients when defined. */
  readonly code?: TCode;
  /** Optional identity namespace sent to clients when defined. */
  readonly scope?: string;
  /** Authored HTTP mapping, not a completed response status. */
  readonly statusCode?: number;
  /** Developer-facing explanation unless repeated under `public`. */
  readonly reason?: string;
  /** Developer-facing advice unless repeated under `public`. */
  readonly hint?: string;
  /** Developer-facing remediation unless repeated under `public`. */
  readonly fix?: string;
  /** Developer-facing URL unless repeated under `public`. */
  readonly link?: string;
  /** Details explicitly approved for client responses. */
  readonly public?: PublicErrorDetails;
  /** Mutable diagnostic correlation value, excluded from responses. */
  requestId?: string;
  /** Mutable nested diagnostic context, excluded from responses. */
  metadata?: ErrorMetadata;
  /** Mutable flat telemetry context, excluded from responses. */
  attributes?: ErrorAttributes;
}
