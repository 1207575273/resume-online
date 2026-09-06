import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 验收：默认打本地全栈（script/dev.mjs 或 deploy:local 起的服）。
 * 截图产物在 e2e/screenshots/，报告在 e2e/playwright-report/。
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  outputDir: "./test-results",
});
