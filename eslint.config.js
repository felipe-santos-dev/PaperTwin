import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    // `tools/scene-bake` é Python; o que há de .js lá dentro é do ambiente virtual.
    // `.claude/` é espaço de trabalho da ferramenta — inclusive cópias inteiras do
    // repositório em `.claude/worktrees/`, que lintadas de novo dariam o mesmo
    // erro várias vezes, num código que não é o desta árvore.
    ignores: ['**/dist/**', '**/coverage/**', 'reference/**', 'tools/scene-bake/**', '.claude/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      '**/*.config.{js,ts}',
      '**/vite.config.ts',
      '**/vitest.config.ts',
      '**/e2e/**/*.ts',
      '**/scripts/**/*.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
