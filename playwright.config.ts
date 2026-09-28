import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    // Support the old E2E_BASE_URL name alongside the new PLAYWRIGHT_BASE_URL.
    baseURL:
      process.env.E2E_BASE_URL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Auth setup — saves member session state for master-fees tests.
    { name: "setup", testMatch: /auth\.setup\.ts/ },

    // Existing master-fees smoke tests — require a member session.
    {
      name: "member-smoke",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/member.json",
      },
      dependencies: ["setup"],
      testMatch: ["**/smoke/*.spec.ts"],
    },

    // New smoke.spec.ts — handles its own auth inline, no storageState needed.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["e2e/smoke.spec.ts"],
    },
  ],
  webServer: process.env.CI
    ? {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
          MYCASE_DB_URL: process.env.E2E_MYCASE_DB_URL ?? "",
          AUTH_SECRET: process.env.AUTH_SECRET ?? "ci-test-secret-32-chars-minimum!!",
          NEXTAUTH_URL: "http://localhost:3000",
        },
      }
    : undefined,
});
