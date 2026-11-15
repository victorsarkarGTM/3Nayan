import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['../../supabase/functions/tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
