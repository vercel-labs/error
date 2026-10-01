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
}

/**
 * Text approved for clients. `message` must be nonblank. Optional fields must
 * be strings; blank ones are omitted. Received guidance does not authorize an
 * action.
 */
export interface PublicErrorDetails {
  /** Client-facing summary containing non-whitespace text. */
  readonly message: string;
  /** Why the error occurred. */
  readonly reason?: string;
  /** Investigation advice. */
  readonly hint?: string;
  /** Recovery step. */
  readonly fix?: string;
  /** Documentation URL. */
  readonly link?: string;
}

/**
 * Options for `VercelError`. Defined `scope` and `code` must be nonblank.
 * Responses use `public`, `scope`, and `code` in the body, and `statusCode` as
 * the HTTP status. Other fields stay server-side.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /** Flat OpenTelemetry-compatible values stored by reference. */
  attributes?: ErrorAttributes;

  /** The underlying error or value that triggered this one, for chaining. */
  readonly cause?: unknown;

  /** Stable code; nonblank if supplied. */
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

  /** Error namespace; nonblank if supplied. */
  readonly scope?: string;

  /** Status mapping; `errorResponse()` defaults to 500 or accepts 400-599. */
  readonly statusCode?: number;

  /** Client text, validated and frozen as a copy. */
  readonly public?: PublicErrorDetails;

  /** Reserved. Automatically captured from Error. */
  readonly stack?: never;
  /** Reserved. Pass message as the first constructor argument. */
  readonly message?: never;
  /** Reserved. Hardcoded to "VercelError" for minification safety. */
  readonly name?: never;
}

/**
 * Fields read from tagged errors while their symbol-keyed tag remains
 * observable. Recognition validates authored fields but leaves diagnostic
 * contents unknown. Any object can forge the tag; use
 * `instanceof VercelError` before calling class methods or relying on local
 * diagnostic types.
 */
export interface VercelErrorLike<
  TCode extends string = string,
> extends ErrorLike {
  /** Optional developer-facing error name. */
  readonly name?: string;
  /** Optional captured stack. */
  readonly stack?: string;
  /** Original value that caused the error; excluded from error responses. */
  readonly cause?: unknown;
  /** Error code; nonblank when sent in a response. */
  readonly code?: TCode;
  /** Error namespace; nonblank when sent in a response. */
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
  /** Mutable nested debugging data whose contents are not validated. */
  metadata?: unknown;
  /** Mutable telemetry data whose contents are not validated. */
  attributes?: unknown;
}
