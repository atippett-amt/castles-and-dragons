import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

const shared = fileURLToPath(new URL('./packages/shared/src', import.meta.url));
const data = fileURLToPath(new URL('./packages/shared/data', import.meta.url));

/**
 * Two suites with different needs.
 *
 * The rules engine must run on plain Node — that is the whole point of keeping
 * `shared` platform-agnostic, and running it under a DOM would quietly hide a
 * stray `document` reference. The client needs jsdom, because its logic is
 * inseparable from the elements it drives.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@shared': shared } },
        test: {
          name: 'shared',
          include: ['packages/shared/tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: { '@shared': shared, '@data': data } },
        test: {
          name: 'client',
          include: ['packages/client/tests/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
