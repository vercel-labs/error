/**
 * Values allowed in nested error metadata.
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
 * Nested application data for debugging and logging. It stays server-side and
 * is excluded from HTTP error responses.
 *
 * Use in `toJSON()`, logs, and debugging tools.
 *
 * @example { userId: '123', query: { table: 'users', limit: 50 } }
 */
export type ErrorMetadata = Record<string, SerializableValue>;

/**
 * Flat values compatible with OpenTelemetry's `AttributeValue` type, suitable
 * for spans, error-tracker tags, and metrics.
 *
 * When attached to `VercelError`, attributes appear in `toJSON()` output but
 * not in `ErrorResponseData` or HTTP response bodies.
 *
 * @example { 'http.method': 'POST', 'db.system': 'postgresql', 'retry.count': 3 }
 */
export type ErrorAttributes = Record<
  string,
  string | number | boolean | string[] | number[] | boolean[] | undefined
>;

/**
 * Minimal object shape recognized by {@link isErrorLike}. Only `message` is
 * checked, and empty strings pass.
 */
export interface ErrorLike {
  message: string;
  name?: string;
  stack?: string;
}

/**
 * Error details explicitly approved for a specific client audience.
 *
 * `message` must contain non-whitespace text; optional fields must be strings.
 * The `VercelError` constructor validates these rules, drops unknown fields,
 * and stores a frozen copy. `errorResponse()` applies the same field validation
 * to flat input and `VercelErrorLike` data. Invalid known fields throw
 * `TypeError`.
 *
 * Receiving recovery guidance does not by itself authorize following a fix or
 * link.
 */
export interface PublicErrorDetails {
  /** Client-facing summary containing non-whitespace text. */
  readonly message: string;
  /** Client-facing explanation of why the error occurred. */
  readonly reason?: string;
  /** Client-facing investigation advice. */
  readonly hint?: string;
  /** Client-facing recovery guidance. */
  readonly fix?: string;
  /** Client-facing documentation URL. */
  readonly link?: string;
}

/**
 * Options for constructing a `VercelError`.
 *
 * `reason`, `hint`, `fix`, and `link` are developer-facing. Client-facing text
 * must be supplied separately under `public`. `errorResponse()` also includes
 * `scope` and `code`, and maps `statusCode` to the concrete HTTP status.
 *
 * `cause`, `requestId`, `metadata`, and `attributes` are excluded from
 * `ErrorResponseData` and HTTP response bodies.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /**
   * Flat OpenTelemetry-compatible values. Stored by reference and excluded
   * from error responses.
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

  /** Suggested recovery step and any condition required before trying it. */
  readonly fix?: string;

  /** Optional developer suggestion, shown before `fix`. */
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

  /** Request ID used for tracing and excluded from error responses. */
  requestId?: string;

  /** Namespace that produced the error, such as a service or subsystem. */
  readonly scope?: string;

  /**
   * HTTP status mapping. `errorResponse()` accepts integers from 400
   * through 599, defaults omission to 500, and throws `RangeError` otherwise.
   */
  readonly statusCode?: number;

  /**
   * Details explicitly approved for a client response. Construction validates
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
 * Data fields recognized by {@link isVercelError} across JavaScript realms.
 *
 * Any object can forge the package symbol tag. For tagged non-local objects, a
 * successful check means only that these fields have the expected runtime
 * shapes. It does not establish where the object came from or make
 * developer-facing fields safe to send to clients. Use
 * `instanceof VercelError` before calling class methods.
 */
export interface VercelErrorLike<
  TCode extends string = string,
> extends ErrorLike {
  /** Original value that caused the error; excluded from error responses. */
  readonly cause?: unknown;
  /** Stable machine-readable code included by `errorResponse()` when defined. */
  readonly code?: TCode;
  /** Error scope included by `errorResponse()` when defined. */
  readonly scope?: string;
  /**
   * Authored status mapping used by `errorResponse()`. Omission defaults to
   * 500; invalid values cause `errorResponse()` to throw `RangeError`.
   */
  readonly statusCode?: number;
  /** Developer-facing explanation; responses use only `public.reason`. */
  readonly reason?: string;
  /** Developer-facing advice; responses use only `public.hint`. */
  readonly hint?: string;
  /** Developer-facing recovery guidance; responses use only `public.fix`. */
  readonly fix?: string;
  /** Developer-facing URL; responses use only `public.link`. */
  readonly link?: string;
  /** Details explicitly approved for client responses. */
  readonly public?: PublicErrorDetails;
  /** Mutable request ID, excluded from responses. */
  requestId?: string;
  /** Mutable nested debugging data, excluded from responses. */
  metadata?: ErrorMetadata;
  /** Mutable flat OpenTelemetry-compatible values, excluded from responses. */
  attributes?: ErrorAttributes;
}
