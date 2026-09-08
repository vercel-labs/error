/** Stable package-namespaced tag for recognizing VercelError data across realms. */
export const VERCEL_ERROR_TAG: unique symbol = Symbol.for(
  '@vercel/error/VercelError',
);

/** Shipped 0.0 tag, retained only to keep legacy errors out of public input. */
export const LEGACY_VERCEL_ERROR_TAG: unique symbol =
  Symbol.for('__vercel_error');
