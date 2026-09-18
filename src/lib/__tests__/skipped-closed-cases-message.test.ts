// The first version of this message agreed the noun with the skipped count
// instead of the total, producing "1 of 2 case was closed". The counts and the
// total vary independently, so every combination needs to read correctly.

import { describe, it, expect } from "vitest";
import { skippedClosedCasesMessage } from "@/lib/formatters";

describe("skippedClosedCasesMessage", () => {
  it("names the single case rather than counting to one", () => {
    expect(skippedClosedCasesMessage(1, 1, "added")).toBe(
      "That case could not be added — it was closed by someone else.",
    );
  });

  it("keeps the noun plural when one of several was skipped", () => {
    expect(skippedClosedCasesMessage(1, 2, "added")).toBe(
      "1 of 2 cases could not be added — it was closed by someone else.",
    );
  });

  it("agrees the verb with the skipped count, not the total", () => {
    expect(skippedClosedCasesMessage(3, 10, "removed")).toBe(
      "3 of 10 cases could not be removed — they were closed by someone else.",
    );
  });

  it("uses the caller's verb", () => {
    expect(skippedClosedCasesMessage(2, 5, "removed")).toContain("could not be removed");
    expect(skippedClosedCasesMessage(2, 5, "added")).toContain("could not be added");
  });

  // Guards the class of bug that produced it: a singular noun after a plural
  // total, in any combination.
  it("never pairs a plural total with a singular noun", () => {
    for (let total = 2; total <= 6; total++) {
      for (let skipped = 1; skipped <= total; skipped++) {
        expect(skippedClosedCasesMessage(skipped, total, "added")).toMatch(
          new RegExp(`^${skipped} of ${total} cases could not be added`),
        );
      }
    }
  });
});
