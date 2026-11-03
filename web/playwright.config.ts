import { defineConfig } from '@playwright/test';

// The specs run against the Docker stack (`npm start` in the repo root), so they test the real gateway and services.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3030' },
});
