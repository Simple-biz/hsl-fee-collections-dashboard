import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// All smoke tests are read-only. No mutations, no DB writes.
//
// Authenticated tests require:
//   E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD   — a member-role account
//   E2E_ADMIN_EMAIL  / E2E_ADMIN_PASSWORD    — an admin-role account
//
// Point these at a test/staging environment, NOT the production DB.
// Use `npm run seed:test-users` to create accounts on the Neon test branch.
// ---------------------------------------------------------------------------

const MEMBER = {
  email: process.env.E2E_MEMBER_EMAIL ?? "",
  password: process.env.E2E_MEMBER_PASSWORD ?? "",
};

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};

async function login(page: Page, creds: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// 1. Login page loads (readiness / health check)
// ---------------------------------------------------------------------------

test("login page renders without crashing", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. Unauthenticated redirect — GET / → /login
// ---------------------------------------------------------------------------

test("unauthenticated access to / redirects to /login", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/, { timeout: 10_000 });
  await expect(page.url()).toContain("/login");
});

// ---------------------------------------------------------------------------
// 3. Authenticated dashboard renders
// ---------------------------------------------------------------------------

test("member can log in and reach the dashboard", async ({ page }) => {
  test.skip(!MEMBER.email || !MEMBER.password, "E2E_MEMBER_EMAIL/PASSWORD not set");

  await login(page, MEMBER);
  expect(page.url()).not.toContain("/login");
  await expect(page.locator("nav, main, [role='main']").first()).toBeVisible({
    timeout: 15_000,
  });
});

// ---------------------------------------------------------------------------
// 4. Denied-access redirect — member cannot reach /admin
// ---------------------------------------------------------------------------

test("member is redirected away from /admin", async ({ page }) => {
  test.skip(!MEMBER.email || !MEMBER.password, "E2E_MEMBER_EMAIL/PASSWORD not set");

  await login(page, MEMBER);
  await page.goto("/admin");
  await page.waitForURL((url) => !url.pathname.startsWith("/admin"), {
    timeout: 10_000,
  });
  expect(page.url()).not.toContain("/admin");
});

// ---------------------------------------------------------------------------
// 5. Admin can reach /admin
// ---------------------------------------------------------------------------

test("admin can reach /admin", async ({ page }) => {
  test.skip(!ADMIN.email || !ADMIN.password, "E2E_ADMIN_EMAIL/PASSWORD not set");

  await login(page, ADMIN);
  await page.goto("/admin");
  await expect(page.url()).toContain("/admin");
  await expect(page.locator("main, [role='main']").first()).toBeVisible({
    timeout: 15_000,
  });
});
