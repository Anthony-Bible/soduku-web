import { defineConfig, devices } from '@playwright/test'

export const E2E_PORT = 18787
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`

/**
 * End-to-end tests against the real Worker (`wrangler dev`) serving the built app from dist/, with a
 * local D1 database in .wrangler/e2e that is recreated on every run. Run `pnpm build` first (`pnpm e2e` does).
 * No email is sent: SES has no credentials here, so tests seed their own Sign-in Email rows (e2e/db.ts).
 */
export default defineConfig({
  testDir: 'e2e',
  // One Worker and one SQLite file behind it; serial runs keep the database writes predictable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: "sh e2e/serve.sh",
    env: { E2E_PORT: String(E2E_PORT) },
    url: `${E2E_ORIGIN}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
