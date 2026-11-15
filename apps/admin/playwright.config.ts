import { defineConfig, devices } from '@playwright/test';
import { localEnv, repoRoot } from './e2e/env';

const env = localEnv();

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3001', trace: 'off', ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: 'pnpm functions:dev',
      cwd: repoRoot,
      url: 'http://127.0.0.1:54331/functions/v1/practitioner-submit',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3001/login',
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: env.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anon,
        NEXT_PUBLIC_FUNCTIONS_URL: 'http://127.0.0.1:54331/functions/v1',
        NEXT_PUBLIC_PROVIDERS: 'fake',
      },
    },
  ],
});
