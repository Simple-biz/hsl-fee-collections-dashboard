import { describe, it, expect } from "vitest";
import {
  parseCaseLink,
  extractMyCaseId,
  parseLeadingDate,
} from "../case-link";

describe("extractMyCaseId", () => {
  it("pulls the numeric id from a court_cases URL", () => {
    expect(
      extractMyCaseId("https://hogansmith.mycase.com/court_cases/12345678"),
    ).toBe(12345678);
  });

  it("is case-insensitive on the host", () => {
    expect(extractMyCaseId("HTTPS://MyCase.com/court_cases/42")).toBe(42);
  });

  it("returns null for non-MyCase or empty input", () => {
    expect(extractMyCaseId("https://example.com/cases/1")).toBeNull();
    expect(extractMyCaseId("")).toBeNull();
    expect(extractMyCaseId(null)).toBeNull();
    expect(extractMyCaseId(undefined)).toBeNull();
  });
});

describe("parseLeadingDate", () => {
  it("parses YYYY.MM.DD to ISO", () => {
    expect(parseLeadingDate("2026.05.22 Watson, Katrina")).toBe("2026-05-22");
  });

  it("zero-pads single-digit month/day and accepts - or /", () => {
    expect(parseLeadingDate("2026-5-2 Foo")).toBe("2026-05-02");
    expect(parseLeadingDate("2026/1/9 Foo")).toBe("2026-01-09");
  });

  it("returns null when there is no leading date", () => {
    expect(parseLeadingDate("Watson, Katrina v. ALJ Smith")).toBeNull();
  });
});

describe("parseCaseLink", () => {
  it("parses the canonical worksheet line", () => {
    expect(
      parseCaseLink("2026.05.22 Watson, Katrina v. ALJ WENDY HOLLINGSWORTH"),
    ).toEqual({
      approvalDate: "2026-05-22",
      firstName: "Katrina",
      lastName: "Watson",
      aljFirstName: "WENDY",
      aljLastName: "HOLLINGSWORTH",
      missingVSeparator: false,
    });
  });

  it("handles a bare 'v' separator and a single-name ALJ", () => {
    const r = parseCaseLink("2024.01.10 Roy, Sam v ALJ Detherage");
    expect(r.firstName).toBe("Sam");
    expect(r.lastName).toBe("Roy");
    expect(r.aljFirstName).toBeNull();
    expect(r.aljLastName).toBe("Detherage");
    expect(r.missingVSeparator).toBe(false);
  });

  it("falls back to 'First Last' when there is no comma", () => {
    const r = parseCaseLink("2024.03.15 Emily Johnson v. ALJ Smith");
    expect(r.firstName).toBe("Johnson");
    expect(r.lastName).toBe("Emily");
  });

  it("strips trailing annotations from claimant and ALJ", () => {
    const r = parseCaseLink(
      "2024.07.08 Martinez, Luis (SSI case) v. ALJ Davis [PHONE]",
    );
    expect(r.lastName).toBe("Martinez");
    expect(r.firstName).toBe("Luis");
    expect(r.aljLastName).toBe("Davis");
  });

  it("flags a missing v-separator and captures no ALJ", () => {
    const r = parseCaseLink("2024.05.22 Garcia, Maria");
    expect(r.lastName).toBe("Garcia");
    expect(r.firstName).toBe("Maria");
    expect(r.aljFirstName).toBeNull();
    expect(r.aljLastName).toBeNull();
    expect(r.missingVSeparator).toBe(true);
  });

  it("ignores an 'SSA' respondent (not a named ALJ)", () => {
    const r = parseCaseLink("2024.02.01 Doe, Jane v. SSA");
    expect(r.aljFirstName).toBeNull();
    expect(r.aljLastName).toBeNull();
  });
});
