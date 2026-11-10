import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';

const environment = JSON.parse(readFileSync('../.local/qa/environment.json', 'utf8'));
if (!environment.isolated || environment.running === false) throw new Error('Start tests/api_integration.py --serve first. QA never targets escolar.');
export default defineConfig({
  testDir: '.', testMatch: /.*\.spec\.ts/, fullyParallel: false, workers: 1,
  timeout: 90_000, expect: { timeout: 12_000 },
  reporter: [['list'], ['json', { outputFile: '../.local/qa/browser-results.json' }]],
  use: { baseURL: environment.base_url, viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure', acceptDownloads: true, actionTimeout: 15_000 },
});
