// Stored values reach the UI in several spellings — legacy enums, sheet
// imports, and admin-managed dropdown values — so these helpers have to cope
// with all of them without anyone extending a map first. The acronym cases are
// the ones a naive title-case gets wrong.

import { describe, it, expect } from "vitest";
import { titleCaseLabel, caseLevelLabel, winSheetStatusLabel } from "@/lib/formatters";

describe("titleCaseLabel", () => {
  it("turns underscores into spaces and title-cases", () => {
    expect(titleCaseLabel("not_started")).toBe("Not Started");
    expect(titleCaseLabel("paid_in_full")).toBe("Paid In Full");
  });

  it("normalises casing regardless of how it was stored", () => {
    expect(titleCaseLabel("started")).toBe("Started");
    expect(titleCaseLabel("STARTED")).toBe("Started");
    expect(titleCaseLabel("Started")).toBe("Started");
  });

  // A naive title-case turns "AC" into "Ac" and "T16" into "T16" only by luck.
  it("leaves known acronyms in capitals", () => {
    expect(titleCaseLabel("AC Remand")).toBe("AC Remand");
    expect(titleCaseLabel("T2_T16")).toBe("T2 T16");
    expect(titleCaseLabel("CONC")).toBe("CONC");
    expect(titleCaseLabel("ALJ")).toBe("ALJ");
  });

  it("copes with stray whitespace", () => {
    expect(titleCaseLabel("  fee   petition  ")).toBe("Fee Petition");
  });
});

describe("caseLevelLabel", () => {
  // The whole point of #454: both spellings are in the production data.
  it("reads the same for both stored spellings of Fee Petition", () => {
    expect(caseLevelLabel("FEE PETITION")).toBe("Fee Petition");
    expect(caseLevelLabel("FEE_PETITION")).toBe("Fee Petition");
  });

  it("collapses the duplicate RECON spelling", () => {
    expect(caseLevelLabel("RECON")).toBe("Recon");
    expect(caseLevelLabel("RECONSIDERATION")).toBe("Recon");
  });

  it("title-cases the ordinary levels", () => {
    expect(caseLevelLabel("HEARING")).toBe("Hearing");
    expect(caseLevelLabel("INITIAL")).toBe("Initial");
  });

  it("keeps AC Remand's capitals", () => {
    expect(caseLevelLabel("AC Remand")).toBe("AC Remand");
  });

  it("falls back cleanly for a level nobody has mapped", () => {
    expect(caseLevelLabel("SOME_NEW_LEVEL")).toBe("Some New Level");
  });

  it("renders nothing for an unset level", () => {
    expect(caseLevelLabel(null)).toBe("");
    expect(caseLevelLabel(undefined)).toBe("");
    expect(caseLevelLabel("")).toBe("");
  });
});

describe("winSheetStatusLabel", () => {
  it("expands the legacy enum values", () => {
    expect(winSheetStatusLabel("not_started")).toBe("Not Started");
    expect(winSheetStatusLabel("closed")).toBe("Closed");
  });

  it("gives both casings of started the same label", () => {
    expect(winSheetStatusLabel("started")).toBe("Started");
    expect(winSheetStatusLabel("Started")).toBe("Started");
  });

  it("passes through the worksheet values", () => {
    expect(winSheetStatusLabel("Finished")).toBe("Finished");
  });

  it("falls back for an unmapped status", () => {
    expect(winSheetStatusLabel("awaiting_review")).toBe("Awaiting Review");
  });

  it("renders nothing for an unset status", () => {
    expect(winSheetStatusLabel(null)).toBe("");
  });
});

// The case detail surfaces render decision and fee-method enums too. They were
// missed on the first pass because every DOM scan was scoped to `main *` and
// that route has no <main> — so `fully_favorable` and `fee agreement` sat in
// plain sight while the scan reported clean.
describe("titleCaseLabel — decision and fee method enums", () => {
  it("expands the decision values", () => {
    expect(titleCaseLabel("fully_favorable")).toBe("Fully Favorable");
    expect(titleCaseLabel("dismissed")).toBe("Dismissed");
    expect(titleCaseLabel("remand")).toBe("Remand");
  });

  it("expands fee method", () => {
    expect(titleCaseLabel("fee_agreement")).toBe("Fee Agreement");
  });

  // The old code used .replace("_", " ") with no /g, so only the first
  // underscore went — "paid_in_full" became "paid in_full".
  it("replaces every underscore, not just the first", () => {
    expect(titleCaseLabel("paid_in_full")).toBe("Paid In Full");
    expect(titleCaseLabel("a_b_c_d")).toBe("A B C D");
  });
});
