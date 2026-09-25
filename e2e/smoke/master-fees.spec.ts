import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the Master Fees page under a member session.
 *
 * Guards against auth regressions on the API routes the page depends on:
 *   - GET /api/team-members     (assigned-to dropdown)
 *   - GET /api/dashboard        (fee records table)
 *   - GET /api/settings/dropdown-options  (dropdown values)
 *
 * A 403 on any of these will surface as an error toast or empty table.
 * See #491 for the post-mortem that motivated these tests.
 */
test.describe("Master Fees — member smoke", () => {
  test("page loads without 4xx errors on data fetches", async ({ page }) => {
    const failedRequests: string[] = [];

    page.on("response", (response) => {
      if (
        response.url().includes("/api/") &&
        response.status() >= 400 &&
        response.status() < 500
      ) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/master-fees");

    // Wait for the table or an identifiable data element to appear.
    await page.waitForSelector('[data-testid="fee-records-table"], table, [role="table"]', {
      timeout: 20_000,
    });

    expect(failedRequests, `4xx responses on member Master Fees load:\n${failedRequests.join("\n")}`).toHaveLength(0);
  });

  test("team-members endpoint accessible (no 403)", async ({ page }) => {
    const response = await page.request.get("/api/team-members");
    expect(response.status()).toBe(200);
  });
});
