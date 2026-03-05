import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests for iHostMC Minecraft server creation.
 * Requires: Run `npm run tauri:test` (or tests start it via webServer).
 * The test server (port 1422) exposes /invoke to call Tauri commands.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:1422",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run tauri:test",
    url: "http://localhost:1422",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
