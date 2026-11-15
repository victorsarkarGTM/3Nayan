import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', 'supabase/functions/_shared/core/**', '**/database.types.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  },
  { files: ['**/tests/**/*.ts', '**/*.test.ts', '**/e2e/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
