import { describe, it, expect } from "vitest";
import { hasPageAccess, effectivePagesForSession } from "../resolve";

describe("hasPageAccess", () => {
  it("checks membership and tolerates null/undefined", () => {
    expect(hasPageAccess(["scoreboard"], "scoreboard")).toBe(true);
    expect(hasPageAccess(["scoreboard"], "settings")).toBe(false);
    expect(hasPageAccess(null, "scoreboard")).toBe(false);
    expect(hasPageAccess(undefined, "scoreboard")).toBe(false);
  });
});

describe("effectivePagesForSession", () => {
  it("uses the session's own pages when present", () => {
    expect(effectivePagesForSession(["scoreboard", "team"], "member")).toEqual([
      "scoreboard",
      "team",
    ]);
  });

  it("falls back to the role's defaults for a stale token with no pages", () => {
    expect(effectivePagesForSession(undefined, "member")).toContain("scoreboard");
    expect(effectivePagesForSession(undefined, "member")).not.toContain("settings");
    expect(effectivePagesForSession([], "admin")).toContain("settings");
  });

  it("falls back to member defaults for an unknown/missing role", () => {
    expect(effectivePagesForSession(undefined, undefined)).toEqual(
      effectivePagesForSession(undefined, "member"),
    );
  });
});
