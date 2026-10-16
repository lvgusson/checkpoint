import { defineConfig } from 'vitest/config';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The kit declares react as a peer; tests borrow the copy installed for apps/web (one React only).
const fromWeb = createRequire(new URL('./apps/web/package.json', import.meta.url));
const webPackage = (name = '') =>
  fromWeb.resolve(`${name}/package.json`).replace(/\/package\.json$/, '');

export default defineConfig({
  test: {
    globalSetup: ['./apps/api/scripts/test-db-global-setup.ts'],
    projects: [
      {
        test: {
          name: 'api',
          root: fileURLToPath(new URL('./apps/api', import.meta.url)),
          environment: 'node',
          env: { LOG_SINK: 'noop', DATABASE_URL: '' },
          include: ['test/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: [
            {
              find: /^@\//,
              replacement: fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
            },
            {
              find: '@checkpoint/ui-react',
              replacement: fileURLToPath(
                new URL('./packages/ui-react/src/index.ts', import.meta.url),
              ),
            },
          ],
        },
        test: {
          name: 'web',
          root: fileURLToPath(new URL('./apps/web', import.meta.url)),
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        resolve: {
          alias: [
            { find: /^react-dom(\/.*)?$/, replacement: `${webPackage('react-dom')}$1` },
            { find: /^react(\/.*)?$/, replacement: `${webPackage('react')}$1` },
          ],
        },
        test: {
          name: 'ui-react',
          root: fileURLToPath(new URL('./packages/ui-react', import.meta.url)),
          environment: 'node',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
