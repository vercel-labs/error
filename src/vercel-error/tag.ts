/** Stable package-namespaced tag for recognizing VercelError data across realms. */
export const VERCEL_ERROR_TAG: unique symbol = Symbol.for(
  '@vercel/error/VercelError',
);
