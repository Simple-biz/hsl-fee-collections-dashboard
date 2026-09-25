import { test as setup } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/member.json");

// Credentials for a member-role account in the target environment.
// Set E2E_MEMBER_EMAIL + E2E_MEMBER_PASSWORD before running.
// DO NOT use seed-test-users accounts against the production DB.
const EMAIL = process.env.E2E_MEMBER_EMAIL;
const PASSWORD = process.env.E2E_MEMBER_PASSWORD;

setup("authenticate as member", async ({ page }) => {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "E2E_MEMBER_EMAIL and E2E_MEMBER_PASSWORD must be set.\n" +
        "Point them at a member-role account in the environment under test."
    );
  }

  await page.goto("/login");

  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  // After successful login the form calls window.location.assign("/"),
  // then middleware redirects to the user's first accessible page.
  await page.waitForURL(/\/(master-fees|overview|$)/, { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
