import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: /game\.spec\.js/,
  timeout: 8 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/playwright-results.json' }]
  ],
  use: {
    headless: true,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 30 * 1000,
    navigationTimeout: 45 * 1000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  outputDir: 'test-results/playwright-artifacts'
});
