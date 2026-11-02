import { defineConfig, devices } from '@playwright/test';

// Set BASE_URL to test a deployed copy; otherwise the dev server is started on port 4200.
const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  // The journeys run against their own stack: npm run e2e:journeys (playwright.journeys.config.ts).
  testIgnore: '**/journeys/**',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: process.env['BASE_URL']
    ? undefined
    : { command: 'npm run start:http', url: baseURL, reuseExistingServer: true, timeout: 180_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
