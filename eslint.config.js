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
      'apps/api/src/seed.ts', // snapshot gerado
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
  // React app and UI kit
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/*.ts', 'packages/ui-react/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
