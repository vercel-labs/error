import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  dts: {
    sourcemap: true,
  },
  entry: {
    client: 'src/client.ts',
    format: 'src/format.ts',
    index: 'src/index.ts',
    server: 'src/server.ts',
    unplugin: 'src/unplugin/index.ts',
    'unplugin/loader': 'src/unplugin/loader.ts',
  },
  fixedExtension: false,
  format: ['esm'],
  sourcemap: true,
});
