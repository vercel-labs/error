const errorConstructor = Error as ErrorConstructor & {
  isError?(value: unknown): value is Error;
};

const nativeIsError = errorConstructor.isError;

/**
 * Check if a value is a standard JavaScript Error object.
 *
 * Uses the `Error.isError` builtin brand check when the runtime provides it
 * (Node 24, 2025+ evergreen browsers): cross-realm errors are recognized
 * without traversing caller-controlled prototype chains or consulting the
 * forgeable `Symbol.toStringTag` property, and prototype forgeries such as
 * `Object.create(Error.prototype)` are rejected.
 *
 * Older runtimes fall back to `instanceof` plus `Object.prototype.toString`
 * branding, which still recognizes real errors from any realm but can be
 * spoofed by a `Symbol.toStringTag` of `"Error"`. A value whose Proxy traps
 * or getters throw during the fallback checks is classified as not an error,
 * matching the brand check. Client-safe serialization never depends on this
 * guard's precision: `errorResponse()` independently rejects any untagged
 * value carrying `name` or `stack`.
 */
export function isError(error: unknown): error is Error {
  if (nativeIsError !== undefined) {
    return nativeIsError(error);
  }

  try {
    return (
      error instanceof Error ||
      Object.prototype.toString.call(error) === '[object Error]'
    );
  } catch {
    return false;
  }
}
