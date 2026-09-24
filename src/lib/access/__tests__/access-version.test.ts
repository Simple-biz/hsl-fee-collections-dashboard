// Pages and capabilities are resolved once at sign-in and baked into the JWT,
// so before this a signed-in user kept whatever set existed then — for up to
// the 30-day session lifetime. #464 added `feePetition.manage` and admins were
// denied their own feature until they signed out and back in (#466).
//
// `shouldRefreshAccess` is the decision point: it says when a token's baked-in
// access is stale enough to be re-resolved from the database.

import { describe, it, expect } from "vitest";
import { ACCESS_SCHEMA_VERSION, shouldRefreshAccess, computeAccessStamp } from "@/lib/access/version";

const token = (over: Record<string, unknown> = {}) => ({
  id: "42",
  role: "admin",
  accessVersion: ACCESS_SCHEMA_VERSION,
  ...over,
});

describe("shouldRefreshAccess", () => {
  it("leaves a current token alone, so the common path costs nothing", () => {
    expect(shouldRefreshAccess(token())).toBe(false);
  });

  it("refreshes a token stamped with an older schema", () => {
    expect(shouldRefreshAccess(token({ accessVersion: ACCESS_SCHEMA_VERSION - 1 }))).toBe(true);
  });

  // Every session in existence when this ships predates the stamp. They are
  // exactly the ones that need repairing, so an absent stamp must count as
  // stale rather than as current.
  it("treats a token minted before the stamp existed as stale", () => {
    expect(shouldRefreshAccess({ id: "42", role: "admin" })).toBe(true);
  });

  // A token could also carry a *newer* stamp — a user whose request lands on an
  // instance still running the previous build during a rollout. Re-resolving is
  // harmless and self-correcting; pinning it to "older than" would leave the
  // token stuck if the constant were ever rolled back.
  it("refreshes on any mismatch, not only on older", () => {
    expect(shouldRefreshAccess(token({ accessVersion: ACCESS_SCHEMA_VERSION + 1 }))).toBe(true);
  });

  describe("declines when the token can't be re-resolved", () => {
    it("has no role", () => {
      expect(shouldRefreshAccess(token({ accessVersion: 0, role: undefined }))).toBe(false);
    });

    it("has no id", () => {
      expect(shouldRefreshAccess(token({ accessVersion: 0, id: undefined }))).toBe(false);
    });

    it("has a non-numeric id", () => {
      expect(shouldRefreshAccess(token({ accessVersion: 0, id: "not-a-number" }))).toBe(false);
    });

    // Anonymous tokens must not be handed a default access set they never had.
    it("is empty", () => {
      expect(shouldRefreshAccess({})).toBe(false);
    });
  });
});

describe("computeAccessStamp", () => {
  const user = new Date("2026-09-20T00:00:00.000Z");
  const older = new Date("2026-09-01T00:00:00.000Z");
  const newer = new Date("2026-09-25T00:00:00.000Z");

  it("returns users.updated_at when there is no override row", () => {
    expect(computeAccessStamp(user, null)).toBe("2026-09-20T00:00:00.000Z");
  });

  it("returns overrideUpdatedAt when it is more recent than users.updated_at", () => {
    expect(computeAccessStamp(user, newer)).toBe("2026-09-25T00:00:00.000Z");
  });

  it("returns users.updated_at when the override row is older", () => {
    expect(computeAccessStamp(user, older)).toBe("2026-09-20T00:00:00.000Z");
  });
});
