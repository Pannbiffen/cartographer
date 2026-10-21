import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the real app in headless Chromium.
// Run with `npm run test:e2e` (first time: `npx playwright install chromium`).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  // On CI a test gets one retry, so a rare flake shows as "flaky" without blocking the deploy
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5174/',
    // The tests' grid coordinates assume this window size
    viewport: { width: 1440, height: 900 },
  },
  // A separate port so tests don't reuse a dev server you have open
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174/',
    reuseExistingServer: false,
  },
});
