export default {
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  entry: ['browser.ts'],
  format: ['iife'],
  logLevel: 'error',
  outDir: 'browser-bundle',
  platform: 'browser',
  target: 'es2022',
};
