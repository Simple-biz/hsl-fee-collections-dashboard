// Adding and removing cases on the Fee Petitions page was briefly open to every
// agent with page access. Staff asked for it narrowed to admin and lead, so it
// now sits behind its own capability rather than a page check.
//
// A dedicated capability rather than reusing case.finalize: granting a member
// "finalize" per-user would otherwise also hand them the Fee Petitions list,
// coupling two unrelated permissions.

import { describe, it, expect } from "vitest";
import {
  CAPABILITY_KEYS,
  roleCapabilityDefaults,
  ROLE_CAPABILITY_DEFAULTS,
} from "@/lib/access/capabilities";

const KEY = "feePetition.manage";

describe("feePetition.manage", () => {
  it("is a registered capability, so it appears in the access overrides UI", () => {
    expect(CAPABILITY_KEYS).toContain(KEY);
  });

  it("is granted to admin, lead and system_admin", () => {
    for (const role of ["system_admin", "admin", "lead"] as const) {
      expect(roleCapabilityDefaults(role)).toContain(KEY);
    }
  });

  it("is withheld from member — the point of the change", () => {
    expect(roleCapabilityDefaults("member")).not.toContain(KEY);
  });

  it("is withheld from an unknown role, which falls back to member", () => {
    expect(roleCapabilityDefaults("something-else")).not.toContain(KEY);
    expect(roleCapabilityDefaults(null)).not.toContain(KEY);
  });

  // Reusing case.finalize would have produced the same role set today, which is
  // exactly why it looked tempting. This pins that they are separate, so a
  // per-user grant of one doesn't silently confer the other.
  it("is independent of case.finalize", () => {
    expect(KEY).not.toBe("case.finalize");
    const memberPlusFinalize = [...ROLE_CAPABILITY_DEFAULTS.member, "case.finalize"];
    expect(memberPlusFinalize).not.toContain(KEY);
  });
});
