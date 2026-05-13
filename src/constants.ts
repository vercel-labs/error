/** Stable tag to identify VercelError instances across realms */
export const VERCEL_ERROR_TAG: unique symbol = Symbol.for('__vercel_error');
