import { createUnplugin, type UnpluginInstance } from 'unplugin';

import { transform } from './transform';

/**
 * Options for the `@vercel/error` strip plugin.
 */
export interface StripErrorsOptions {
  /**
   * Force the transform on or off regardless of the detected build mode. When
   * omitted, the transform runs only when `process.env.NODE_ENV` is
   * `production`.
   */
  enabled?: boolean;

  /**
   * Extra module filter. Receives the module id and returns `false` to skip it.
   * Applied on top of the built-in extension filter.
   */
  include?: (id: string) => boolean;

  /**
   * Transform files inside `node_modules`. Defaults to `false`, since apps
   * usually strip their own source rather than prebuilt dependencies.
   */
  includeNodeModules?: boolean;

  /**
   * Log a one-line summary of how many call sites were stripped, per module.
   * Useful for confirming the plugin is active. Defaults to `false`.
   */
  verbose?: boolean;
}

const DEFAULT_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const NODE_MODULES = /[/\\]node_modules[/\\]/;

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
 * import { stripErrors } from '@vercel/error/unplugin';
 *
 * export default defineConfig({
 *   plugins: [stripErrors.vite()],
 * });
 * ```
 */
export const stripErrors: UnpluginInstance<StripErrorsOptions | undefined> =
  createUnplugin((options?: StripErrorsOptions) => {
    const active = options?.enabled ?? getNodeEnv() === 'production';

    return {
      name: '@vercel/error/strip',
      enforce: 'pre',
      transformInclude(id) {
        if (!DEFAULT_EXTENSIONS.test(id)) return false;
        if (!options?.includeNodeModules && NODE_MODULES.test(id)) return false;
        return options?.include ? options.include(id) : true;
      },
      transform(code, id) {
        if (!active) return null;
        const result = transform(code, id);
        if (result && options?.verbose) {
          // eslint-disable-next-line no-console -- opt-in build diagnostics
          console.info(
            `[@vercel/error/strip] stripped ${result.count} call site(s) in ${id}`,
          );
        }
        return result;
      },
    };
  });

function getNodeEnv(): string | undefined {
  return typeof process !== 'undefined' ? process.env?.['NODE_ENV'] : undefined;
}
