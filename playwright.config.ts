import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 120_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000
  }
});
