import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Extension tests need to run sequentially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Only one worker for extension tests
  reporter: [['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'chrome-extension',
      testMatch: '*.spec.ts',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
