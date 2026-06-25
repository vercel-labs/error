import { transform } from './transform';

/**
 * Minimal webpack loader context used by this loader. Matches both webpack and
 * Turbopack's `loader-runner` implementation.
 */
interface LoaderContext {
  resourcePath: string;
  async(): (error: Error | null, content?: string, sourceMap?: object) => void;
  getOptions?: () => StripLoaderOptions | undefined;
}

/**
 * Options accepted via `turbopackLoaderOptions` (or webpack loader options).
 */
export interface StripLoaderOptions {
  /**
   * Force the transform on or off. When omitted, the loader strips only when
   * `process.env.NODE_ENV === 'production'`.
   */
  enabled?: boolean;
}

/**
 * Webpack-compatible loader that strips `@vercel/error` prose for production.
 *
 * Use this with Next.js Turbopack, which runs webpack loaders but does not
 * support unplugin. Restrict it to production with a rule condition.
 *
 * @example
 * ```js
 * // next.config.js
 * module.exports = {
 *   turbopack: {
 *     rules: {
 *       '*.{ts,tsx,js,jsx}': {
 *         condition: 'production',
 *         loaders: ['@vercel/error/unplugin/loader'],
 *       },
 *     },
 *   },
 * };
 * ```
 */
function stripErrorsLoader(this: LoaderContext, source: string): void {
  const callback = this.async();
  const options = this.getOptions?.() ?? {};
  const active =
    options.enabled ??
    (typeof process !== 'undefined' &&
      process.env?.['NODE_ENV'] === 'production');

  if (!active) {
    callback(null, source);
    return;
  }

  try {
    const result = transform(source, this.resourcePath);
    if (result) {
      callback(null, result.code, result.map as object);
    } else {
      callback(null, source);
    }
  } catch (error) {
    callback(error as Error);
  }
}

export default stripErrorsLoader;
