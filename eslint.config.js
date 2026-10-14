// ESLint flat config. Formatação fica 100% com o Prettier (eslint-config-prettier desliga
// as regras de estilo que conflitariam); o ESLint cuida só de qualidade/correção.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig(
  {
    ignores: [
      '**/dist/',
      '**/.angular/',
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
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  // Front Angular: TS dos componentes + templates inline
  {
    files: ['apps/web/**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    languageOptions: { globals: globals.browser },
    processor: angular.processInlineTemplates,
    rules: {
      // Componentes do app usam nomes curtos (Library, Queue, Detail) e seletor implícito.
      '@angular-eslint/component-class-suffix': 'off',
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
);
