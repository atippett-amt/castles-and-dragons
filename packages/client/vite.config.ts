import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // `shared` is TypeScript source with no build step, so alias straight into
      // it rather than resolving through node_modules.
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
      '@data': fileURLToPath(new URL('../shared/data', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    // The map art is 3.7 MB; never inline it into the JS bundle.
    assetsInlineLimit: 4096,
  },
});
