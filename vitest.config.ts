import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
    ],
  },
});
