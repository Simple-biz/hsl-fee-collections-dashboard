import { describe, it, expect } from "vitest";
import {
  resolveDecisionOutcome,
  resolveLevelWon,
  buildClaimTypeArray,
  countPdfFields,
} from "../chronicle-import-mapper";

describe("resolveDecisionOutcome", () => {
  it("resolves an unfavorable decision correctly, not as fully favorable", () => {
    // Regression test: "unfavorable" contains "favorable" as a substring —
    // checking for "favorable" first would misclassify every unfavorable
    // decision as fully_favorable.
    expect(resolveDecisionOutcome("Unfavorable Decision")).toBe("unfavorable");
    expect(resolveDecisionOutcome("UNFAVORABLE")).toBe("unfavorable");
  });

  it("resolves a favorable decision", () => {
    expect(resolveDecisionOutcome("Fully Favorable")).toBe("fully_favorable");
    expect(resolveDecisionOutcome("Favorable")).toBe("fully_favorable");
  });

  it("resolves a dismissal", () => {
    expect(resolveDecisionOutcome("Dismissal")).toBe("dismissed");
  });

  it("resolves an unrecognized non-empty decision as unknown", () => {
    expect(resolveDecisionOutcome("Remanded")).toBe("unknown");
  });

  it("resolves a missing decision as null", () => {
    expect(resolveDecisionOutcome(null)).toBeNull();
    expect(resolveDecisionOutcome(undefined)).toBeNull();
    expect(resolveDecisionOutcome("")).toBeNull();
  });
});

describe("resolveLevelWon", () => {
  it("passes through a known level", () => {
    expect(resolveLevelWon("INITIAL")).toBe("INITIAL");
    expect(resolveLevelWon("RECON")).toBe("RECON");
    expect(resolveLevelWon("HEARING")).toBe("HEARING");
    expect(resolveLevelWon("AC")).toBe("AC");
  });

  it("falls back to HEARING for an unknown level", () => {
    expect(resolveLevelWon("FEDERAL_COURT")).toBe("HEARING");
    expect(resolveLevelWon("something else")).toBe("HEARING");
  });
});

describe("buildClaimTypeArray", () => {
  it("splits T2_T16 into both types", () => {
    expect(buildClaimTypeArray("T2_T16")).toEqual(["T2", "T16"]);
  });

  it("wraps a single claim type", () => {
    expect(buildClaimTypeArray("T2")).toEqual(["T2"]);
    expect(buildClaimTypeArray("T16")).toEqual(["T16"]);
  });
});

describe("countPdfFields", () => {
  it("returns an empty array when pdfFields is null/undefined", () => {
    expect(countPdfFields(null)).toEqual([]);
    expect(countPdfFields(undefined)).toEqual([]);
  });

  it("counts only keys with a non-null value", () => {
    expect(
      countPdfFields({ fullSsn: "123-45-6789", dob: null, email: "a@b.com" }),
    ).toEqual(["fullSsn", "email"]);
  });

  it("excludes keys that are absent entirely, same as excluding null ones", () => {
    expect(countPdfFields({ fullSsn: "123-45-6789" })).toEqual(["fullSsn"]);
  });
});
