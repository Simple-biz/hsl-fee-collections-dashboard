// Formatting labels for display created a trap: two stored spellings of the
// same thing ("FEE_PETITION" and "FEE PETITION") format to one label, so a row
// on the legacy spelling showed "Fee Petition" twice with no way to tell the
// options apart. Found in the browser auditing #461.

import { describe, it, expect } from "vitest";
import { buildListboxOptions } from "@/lib/listbox-options";
import { caseLevelLabel } from "@/lib/formatters";
import type { ApprovedByOption } from "@/types";

const opt = (id: number, name: string, isActive = true): ApprovedByOption => ({
  id,
  name,
  isActive,
  sortOrder: id,
});

const LEVELS = [opt(1, "INITIAL"), opt(2, "FEE PETITION"), opt(3, "HEARING")];

describe("buildListboxOptions", () => {
  it("formats labels while keeping the stored value", () => {
    const opts = buildListboxOptions(LEVELS, "HEARING", undefined, undefined, caseLevelLabel);
    const hearing = opts.find((o) => o.value === "HEARING");
    expect(hearing?.label).toBe("Hearing");
  });

  it("never shows the same label twice when a legacy spelling collapses", () => {
    const opts = buildListboxOptions(LEVELS, "FEE_PETITION", undefined, undefined, caseLevelLabel);
    const labels = opts.map((o) => o.label);
    expect(labels.filter((l) => l === "Fee Petition")).toHaveLength(1);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // Listbox resolves the selected option by value — without a match the
  // trigger falls back to the placeholder and the row looks unset.
  it("keeps an option carrying the row's own value so the trigger still matches", () => {
    const opts = buildListboxOptions(LEVELS, "FEE_PETITION", undefined, undefined, caseLevelLabel);
    const selected = opts.find((o) => o.value === "FEE_PETITION");
    expect(selected).toBeDefined();
    expect(selected?.label).toBe("Fee Petition");
  });

  it("still lists a current value that has no counterpart in the list", () => {
    const opts = buildListboxOptions(LEVELS, "AC Remand", undefined, undefined, caseLevelLabel);
    expect(opts.find((o) => o.value === "AC Remand")?.label).toBe("AC Remand");
    expect(opts).toHaveLength(5); // placeholder + current + 3 active
  });

  it("leaves the canonical spelling untouched", () => {
    const opts = buildListboxOptions(LEVELS, "FEE PETITION", undefined, undefined, caseLevelLabel);
    expect(opts.filter((o) => o.label === "Fee Petition")).toHaveLength(1);
    expect(opts.find((o) => o.label === "Fee Petition")?.value).toBe("FEE PETITION");
  });

  it("behaves as before when no formatter is given", () => {
    const opts = buildListboxOptions(LEVELS, "FEE_PETITION");
    expect(opts.map((o) => o.label)).toEqual([
      "— Select —", "FEE_PETITION", "INITIAL", "FEE PETITION", "HEARING",
    ]);
  });

  it("omits inactive options unless they are the row's current value", () => {
    const withRetired = [...LEVELS, opt(4, "RETIRED_LEVEL", false)];
    expect(buildListboxOptions(withRetired, "HEARING").map((o) => o.value)).not.toContain("RETIRED_LEVEL");
    expect(buildListboxOptions(withRetired, "RETIRED_LEVEL").map((o) => o.value)).toContain("RETIRED_LEVEL");
  });
});

// The Win Sheet Status <select> hand-rolled its own option list and so missed
// the collapse entirely — 195 rows store lowercase "started" against an admin
// list offering "Started", and both formatted to the same label. It now uses
// this builder too, which is what these cases protect.
describe("buildListboxOptions — win sheet status casing", () => {
  const STATUSES = [opt(1, "Started"), opt(2, "Finished")];
  const label = (s: string) => (s === "started" || s === "Started" ? "Started" : s);

  it("collapses a casing variant of an option still in the list", () => {
    const opts = buildListboxOptions(STATUSES, "started", undefined, undefined, label);
    const labels = opts.map((o) => o.label);
    expect(labels.filter((l) => l === "Started")).toHaveLength(1);
    expect(opts.find((o) => o.label === "Started")?.value).toBe("started");
  });

  it("leaves a genuinely distinct legacy value listed on its own", () => {
    const opts = buildListboxOptions(STATUSES, "not_started", undefined, undefined,
      (s) => (s === "not_started" ? "Not Started" : s));
    expect(opts.map((o) => o.label)).toEqual(["— Select —", "Not Started", "Started", "Finished"]);
  });
});
