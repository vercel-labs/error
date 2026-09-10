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

/** Nested debugging data included in `toJSON()` but excluded from responses. */
export type ErrorMetadata = Record<string, SerializableValue>;

/**
 * Flat OpenTelemetry-compatible values included in `toJSON()` but excluded
 * from responses.
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
 * Text approved for clients. `message` must contain non-whitespace text;
 * optional fields must be strings. Invalid fields throw `TypeError`. Receiving
 * a `fix` or `link` does not authorize using it.
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
 * Options for `VercelError`. Responses include `public`, `scope`, `code`, and
 * the mapped `statusCode`; other fields stay server-side.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /** Flat OpenTelemetry-compatible values stored by reference. */
  attributes?: ErrorAttributes;

  /** The underlying error or value that triggered this one, for chaining. */
  readonly cause?: unknown;

  /** Stable machine-readable code; keep it unchanged when rewording messages. */
  readonly code?: TCode;

  /** Suggested recovery step and any condition required before trying it. */
  readonly fix?: string;

  /** Optional developer suggestion, shown before `fix`. */
  readonly hint?: string;

  /** URL to documentation for this error. A `createErrors` factory with `docsBaseUrl` derives it from `code`. */
  readonly link?: string;

  /** Nested debugging data stored by reference. */
  metadata?: ErrorMetadata;

  /** Why the error happened, the root-cause explanation behind the message. */
  readonly reason?: string;

  /** Request ID used for tracing and excluded from error responses. */
  requestId?: string;

  /** Namespace that produced the error, such as a service or subsystem. */
  readonly scope?: string;

  /** Status mapping; `errorResponse()` defaults to 500 or accepts 400-599. */
  readonly statusCode?: number;

  /** Client text; validated, copied without unknown fields, and frozen. */
  readonly public?: PublicErrorDetails;

  /** Reserved. Automatically captured from Error. */
  readonly stack?: never;
  /** Reserved. Pass message as the first constructor argument. */
  readonly message?: never;
  /** Reserved. Hardcoded to "VercelError" for minification safety. */
  readonly name?: never;
}

/**
 * Fields read from tagged errors in another JavaScript realm. Any object can
 * forge the tag; use `instanceof VercelError` before calling class methods.
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
  /** Status mapping; `errorResponse()` defaults to 500 or throws `RangeError`. */
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
