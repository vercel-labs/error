import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@vercel/error/server': fileURLToPath(
        new URL('./src/server.ts', import.meta.url),
      ),
      '@vercel/error': fileURLToPath(
        new URL('./src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'examples/**/*.spec.ts'],
  },
});
