const errorConstructor = Error as ErrorConstructor & {
  isError(value: unknown): value is Error;
};

/**
 * Check if a value is a standard JavaScript Error object.
 *
 * Uses Node's intrinsic `Error.isError` brand check, which handles cross-realm
 * errors without traversing caller-controlled prototype chains or consulting
 * the forgeable `Symbol.toStringTag` property.
 */
export function isError(error: unknown): error is Error {
  return errorConstructor.isError(error);
}
