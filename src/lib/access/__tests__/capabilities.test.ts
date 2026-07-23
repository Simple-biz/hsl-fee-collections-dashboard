import { describe, it, expect } from "vitest";
import {
  roleCapabilityDefaults,
  CAPABILITY_KEYS,
} from "../capabilities";
import { effectiveCapabilities, hasCapability } from "../resolve";

describe("roleCapabilityDefaults", () => {
  it("gives system_admin every capability", () => {
    expect(roleCapabilityDefaults("system_admin")).toEqual(CAPABILITY_KEYS);
  });

  it("gives admin every capability except fees.edit and feesConfirmation.edit", () => {
    const caps = roleCapabilityDefaults("admin");
    expect(caps).not.toContain("fees.edit");
    expect(caps).not.toContain("feesConfirmation.edit");
    expect(caps).toContain("case.create");
    expect(caps).toContain("case.delete");
    expect(caps).toContain("case.update");
    expect(caps).toContain("case.finalize");
    expect(caps).toContain("case.editPii");
    expect(caps).toHaveLength(CAPABILITY_KEYS.length - 2);
  });

  it("gives lead update + finalize + PII, but not create/delete/fees/PIF", () => {
    const caps = roleCapabilityDefaults("lead");
    expect(caps).toContain("case.update");
    expect(caps).toContain("case.finalize");
    expect(caps).toContain("case.editPii");
    expect(caps).toContain("dailyMetrics.editOthers");
    expect(caps).toContain("leaderNotes.access");
    expect(caps).not.toContain("case.create");
    expect(caps).not.toContain("case.delete");
    expect(caps).not.toContain("fees.edit");
    expect(caps).not.toContain("feesConfirmation.edit");
  });

  it("gives member update only (no create/delete/finalize/PII)", () => {
    expect(roleCapabilityDefaults("member")).toEqual(["case.update"]);
  });

  it("falls back to member for unknown/empty roles", () => {
    expect(roleCapabilityDefaults(undefined)).toEqual(["case.update"]);
    expect(roleCapabilityDefaults("nonsense")).toEqual(["case.update"]);
  });
});

describe("effectiveCapabilities (role default ⊕ overrides)", () => {
  it("returns role defaults when there are no overrides", () => {
    expect(effectiveCapabilities("member", null)).toEqual(["case.update"]);
    expect(effectiveCapabilities("member", {})).toEqual(["case.update"]);
  });

  it("grants a capability the role default lacks", () => {
    const caps = effectiveCapabilities("member", {
      capabilities: { "case.finalize": true },
    });
    expect(caps).toContain("case.update");
    expect(caps).toContain("case.finalize");
  });

  it("revokes a capability the role default includes", () => {
    const caps = effectiveCapabilities("lead", {
      capabilities: { "case.editPii": false },
    });
    expect(caps).not.toContain("case.editPii");
    expect(caps).toContain("case.update");
  });

  it("ignores page overrides when resolving capabilities", () => {
    const caps = effectiveCapabilities("member", {
      pages: { admin: true },
    });
    expect(caps).toEqual(["case.update"]);
  });

  it("restores fees.edit and feesConfirmation.edit for admin via per-user override", () => {
    const caps = effectiveCapabilities("admin", {
      capabilities: { "fees.edit": true, "feesConfirmation.edit": true },
    });
    expect(caps).toContain("fees.edit");
    expect(caps).toContain("feesConfirmation.edit");
  });
});

describe("hasCapability", () => {
  it("checks membership and tolerates null/undefined", () => {
    expect(hasCapability(["case.update"], "case.update")).toBe(true);
    expect(hasCapability(["case.update"], "case.delete")).toBe(false);
    expect(hasCapability(null, "case.update")).toBe(false);
    expect(hasCapability(undefined, "case.create")).toBe(false);
  });
});
