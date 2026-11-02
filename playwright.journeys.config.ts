import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end journeys (Phase 9.1, e2e/journeys/README.md) against the isolated stack: this app's
 * dev server on 4321 proxied to an API on 3021 over the schema `campusone_e2e`. Both are started (and
 * stopped afterwards) when they aren't running already; the user's servers on 4200 and 3000 are
 * never used. Set BASE_URL to run the journeys against a stack started elsewhere.
 */
const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4321';

export default defineConfig({
  testDir: './e2e/journeys',
  // One journey at a time: the console journeys share the sample administrator's session.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/journeys' }]],
  outputDir: 'test-results/journeys',
  use: {
    baseURL,
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env['BASE_URL']
    ? undefined
    : [
        {
          command: 'node e2e/journeys/stack.mjs api',
          url: 'http://127.0.0.1:3021/health/live',
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'node e2e/journeys/stack.mjs web',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 300_000,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
