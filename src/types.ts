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
 * Can contain arbitrarily nested values. Server-side only — excluded from HTTP error responses.
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
  attributes?: ErrorAttributes;
  cause?: unknown;
  code?: TCode;
  fix?: string;
  hint?: string;
  link?: string;
  metadata?: ErrorMetadata;
  reason?: string;
  requestId?: string;
  scope?: string;
  statusCode?: number;
  userMessage?: string;

  /** Reserved — automatically captured from Error */
  stack?: never;
  /** Reserved — pass message as first constructor argument */
  message?: never;
  /** Reserved — hardcoded to "VercelError" for minification safety */
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
