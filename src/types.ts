/**
 * Recursive type for structured metadata values.
 * Supports arbitrary nesting for domain-specific context.
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
 * Route to: serialization, logging, debugging tools.
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
 * Configuration options for creating a VercelError instance.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /** Flat OTel-compatible tags for traces, metrics, and error trackers. */
  attributes?: ErrorAttributes;

  /** The underlying error or value that triggered this one, for chaining. */
  cause?: unknown;

  /**
   * Stable, machine-readable identifier for this error. Keep it constant even
   * when you reword the message, so users can search it and docs can link to
   * it. Pick whatever style fits your registry: semantic names
   * (`pool_exhausted`), numeric codes (`E1001`), or namespaced numbers
   * (`B2011`). Numbering is optional, so use words when you prefer them.
   */
  code?: TCode;

  /** Actionable step that resolves the error, such as a command or config change. */
  fix?: string;

  /** Advisory tip that helps the developer, shown before `fix`. */
  hint?: string;

  /** URL to documentation for this error. Derivable from `code` via `docsBaseUrl`. */
  link?: string;

  /** Nested domain context for debugging and logging. Never sent to clients. */
  metadata?: ErrorMetadata;

  /** Why the error happened, the root-cause explanation behind the message. */
  reason?: string;

  /** Correlation ID for tracing this error across services. */
  requestId?: string;

  /** Namespace that produced the error, such as a service or subsystem. */
  scope?: string;

  /** HTTP status code for the response. Defaults to 500 on the wire. */
  statusCode?: number;

  /** Client-safe message sent over the wire instead of the developer `message`. */
  userMessage?: string;

  /** Reserved. Automatically captured from Error */
  stack?: never;
  /** Reserved. Pass message as the first constructor argument */
  message?: never;
  /** Reserved. Hardcoded to "VercelError" for minification safety */
  name?: never;
}

/**
 * The canonical wire format for all Vercel HTTP error responses.
 *
 * `message` maps to `userMessage` from VercelError, falling back to `message`.
 */
export interface ErrorResponse {
  error: {
    code?: string;
    message: string;
    reason?: string;
    hint?: string;
    fix?: string;
    link?: string;
  };
}

/**
 * Minimal interface for any object that can look up headers by name.
 * Compatible with `Headers`, `ReadonlyHeaders` (Next.js), and plain objects.
 */
export interface HeadersLike {
  get(name: string): string | null;
}
