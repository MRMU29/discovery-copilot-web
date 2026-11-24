import { defineConfig } from '@playwright/test'

/**
 * Smoke E2E (§7.5). Deliberately small: three flows that cover "create → record →
 * export", the path a regression would break first.
 *
 * Uses the locally installed Microsoft Edge channel because the repo has no
 * browser download step; run it locally with `pnpm test:e2e`. CI runs the unit
 * suite only (see .github/workflows/ci.yml) — installing browsers there is a
 * separate decision, not a silent requirement.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 240_000,
  },
})
