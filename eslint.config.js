// ESLint flat config. Formatação fica 100% com o Prettier (eslint-config-prettier desliga
// as regras de estilo que conflitariam); o ESLint cuida só de qualidade/correção.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig(
  {
    ignores: [
      '**/dist/',
      'node_modules/',
      'apps/api/infra/',
      'apps/api/src/data/seed.ts', // snapshot gerado
    ],
  },
  // Scripts JS (config, scripts/, api/index.mjs): Node
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // API + modelos compartilhados (Node, TS por type stripping)
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
    ignores: ['packages/ui-react/**'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // Inward-only dependency rules for apps/api/src
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/data/**',
                '**/services/**',
                '**/routes/**',
                '**/main/**',
                '**/integrations/**',
              ],
              message:
                'Domain layer must not depend on outer layers (data, services, routes, main, integrations).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/**', '**/routes/**', '**/main/**'],
              message: 'Data layer must not depend on services, routes, or main.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/routes/**', '**/main/**'],
              message: 'Services layer must not depend on routes or main.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/routes/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/main/**'],
              message: 'Routes layer must not depend on main.',
            },
          ],
        },
      ],
    },
  },
  // React app and UI kit
  {
    files: [
      'apps/web/src/**/*.{ts,tsx}',
      'apps/web/*.ts',
      'apps/web/e2e/**/*.ts',
      'packages/ui-react/**/*.{ts,tsx}',
    ],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
