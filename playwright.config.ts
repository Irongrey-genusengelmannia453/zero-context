import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000, // Extensions + Model downloading + Fallbacks can be slow
  expect: {
    timeout: 45000
  },
  fullyParallel: false,
  workers: 1, // Run sequentially for easier debugging with extensions
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
});
