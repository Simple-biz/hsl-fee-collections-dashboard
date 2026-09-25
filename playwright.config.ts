import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests — run against the local dev server.
 *
 * Prerequisites:
 *   1. Set E2E_MEMBER_EMAIL + E2E_MEMBER_PASSWORD to a member-role prod account.
 *      Do NOT use seed-test-users credentials against the production DB.
 *   2. npm run dev  (or set E2E_BASE_URL to another running instance)
 *
 * Run:
 *   E2E_MEMBER_EMAIL=you@hogansmith.com E2E_MEMBER_PASSWORD=... npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Auth setup runs first, saves session state for the other projects.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "member-smoke",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/member.json",
      },
      dependencies: ["setup"],
    },
  ],
});
