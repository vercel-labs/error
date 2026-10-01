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
 * Text approved for clients. `message` must contain more than whitespace.
 * Optional fields must be strings. Blank ones are omitted; other text is kept
 * exactly as given. Invalid fields throw `TypeError`. A received `fix` or `link`
 * does not authorize an action.
 */
export interface PublicErrorDetails {
  /** Client-facing summary containing non-whitespace text. */
  readonly message: string;
  /** Client-facing explanation; blank text is omitted. */
  readonly reason?: string;
  /** Client-facing investigation advice; blank text is omitted. */
  readonly hint?: string;
  /** Client-facing recovery guidance; blank text is omitted. */
  readonly fix?: string;
  /** Client-facing documentation URL; blank text is omitted. */
  readonly link?: string;
}

/**
 * Options for `VercelError`. When set, `scope` and `code` must be nonblank;
 * blank values throw `TypeError`. Other text is kept exactly as given. Responses
 * include `public`, `scope`, and `code` in the body, and use `statusCode` as the
 * HTTP status. Other fields stay server-side.
 */
export interface VercelErrorOptions<TCode extends string = string> {
  /** Flat OpenTelemetry-compatible values stored by reference. */
  attributes?: ErrorAttributes;

  /** The underlying error or value that triggered this one, for chaining. */
  readonly cause?: unknown;

  /** Stable nonblank code; surrounding whitespace is preserved. */
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

  /** Nonblank namespace, such as a service or subsystem; text is preserved. */
  readonly scope?: string;

  /** Status mapping; `errorResponse()` defaults to 500 or accepts 400-599. */
  readonly statusCode?: number;

  /** Client text; validated, blank optional fields omitted, copied, and frozen. */
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
  /** Optional code; must be nonblank when used in a response. */
  readonly code?: TCode;
  /** Optional scope; must be nonblank when used in a response. */
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
