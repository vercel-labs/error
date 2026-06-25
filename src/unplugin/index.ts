import { createUnplugin, type UnpluginInstance } from 'unplugin';

import { transform } from './transform';

/**
 * Options for the `@vercel/error` strip plugin.
 */
export interface VercelErrorStripOptions {
  /**
   * Force the transform on or off regardless of the detected build mode. When
   * omitted, the transform runs only for production builds (resolved from the
   * bundler's mode or `process.env.NODE_ENV`).
   */
  enabled?: boolean;

  /**
   * Extra module filter. Receives the module id and returns `false` to skip it.
   * Applied on top of the built-in extension filter.
   */
  include?: (id: string) => boolean;
}

const DEFAULT_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Build-time plugin that strips human-readable error prose from
 * `@vercel/error` call sites in production builds, shrinking client bundles.
 *
 * Removes the message argument and the `reason`, `hint`, `fix`, and
 * `userMessage` options from `new VercelError(...)` and `createErrors` factory
 * calls. Keeps `code`, `scope`, `statusCode`, and `link` so a stripped error
 * still identifies itself by `[scope:code]`.
 *
 * Works with Vite, Rollup, Rolldown, webpack, esbuild, and Rspack through the
 * matching adapter (`.vite()`, `.webpack()`, and so on).
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { vercelErrorStrip } from '@vercel/error/unplugin';
 *
 * export default defineConfig({
 *   plugins: [vercelErrorStrip.vite()],
 * });
 * ```
 */
export const vercelErrorStrip: UnpluginInstance<
  VercelErrorStripOptions | undefined
> = createUnplugin((options?: VercelErrorStripOptions) => {
  const active = options?.enabled ?? getNodeEnv() === 'production';

  return {
    name: '@vercel/error/strip',
    enforce: 'pre',
    transformInclude(id) {
      if (!DEFAULT_EXTENSIONS.test(id)) return false;
      return options?.include ? options.include(id) : true;
    },
    transform(code, id) {
      if (!active) return null;
      return transform(code, id);
    },
  };
});

function getNodeEnv(): string | undefined {
  return typeof process !== 'undefined' ? process.env?.['NODE_ENV'] : undefined;
}
