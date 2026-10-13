import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  globalSetup: './tests/setup.js',
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  reporter: 'list',
  webServer: [
    { command: '../backend/.venv/bin/python ../backend/scripts/serve_browser_tests.py', url: 'http://127.0.0.1:8001/api/health', reuseExistingServer: false },
    { command: 'API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: false },
  ],
});
