import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    server: 'src/server.ts',
    format: 'src/format.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: {
    sourcemap: true,
  },
  clean: true,
  sourcemap: true,
});
