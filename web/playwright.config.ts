import { defineConfig, devices } from '@playwright/test';

// Uses the locally installed Google Chrome (channel: 'chrome'), so no browser download is
// needed, and Chrome is the browser that has the on-device Gemini Nano model.
// BASE_URL lets P5 point the same smoke test at the hosted site.
const baseURL = process.env.BASE_URL ?? 'http://localhost:5173';
const useLocalServer = !process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: useLocalServer
    ? { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 60_000 }
    : undefined,
});
