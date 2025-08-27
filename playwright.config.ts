import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Extension tests need to run sequentially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Only one worker for extension tests
  reporter: [['html', { open: 'never' }], ['line']],
  outputDir: 'test-results',
  use: {
    trace: 'on-first-retry',
    headless: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
