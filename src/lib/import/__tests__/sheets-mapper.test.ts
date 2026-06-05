import { describe, it, expect } from "vitest";
import { mapSheetRows, SYNTHETIC_ID_BASE, type SheetRow } from "../sheets-mapper";

// Base factory — all fields a well-formed row would have
const row = (overrides: Partial<SheetRow> = {}): SheetRow => ({
  "CASE LINK": "2024.01.15 Smith, John v. ALJ Doe",
  "CASE LINK_url": "https://app.mycase.com/court_cases/12345",
  "CLAIM TYPE": "T2",
  "APPROVAL DATE": "2024-01-15",
  "WIN SHEET STATUS": "not_started",
  "T16 RETRO": 0,
  "T2 RETRO": 48000,
  "T2 FEE DUE": 6000,
  ...overrides,
});

const warnings = (rows: SheetRow[]) => mapSheetRows(rows).warnings;
const parsed = (rows: SheetRow[]) => mapSheetRows(rows).rows;

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("valid row", () => {
  it("parses with no warnings", () => {
    expect(warnings([row()])).toHaveLength(0);
  });

  it("extracts clientId from MyCase URL", () => {
    const [r] = parsed([row()]);
    expect(r.clientId).toBe(12345);
  });

  it("extracts first and last name from CASE LINK", () => {
    const [r] = parsed([row()]);
    expect(r.firstName).toBe("John");
    expect(r.lastName).toBe("Smith");
  });

  it("maps claim type T2 correctly", () => {
    const [r] = parsed([row({ "CLAIM TYPE": "T2" })]);
    expect(r.claimTypeLabel).toBe("T2");
  });

  it("maps CONC to T2_T16", () => {
    const [r] = parsed([row({ "CLAIM TYPE": "CONC" })]);
    expect(r.claimTypeLabel).toBe("T2_T16");
    expect(r.claimType).toEqual(["T2", "T16"]);
  });

  it("maps T2/T16 variant to T2_T16", () => {
    const [r] = parsed([row({ "CLAIM TYPE": "T2/T16" })]);
    expect(r.claimTypeLabel).toBe("T2_T16");
  });

  it("maps T16 correctly", () => {
    const [r] = parsed([row({ "CLAIM TYPE": "T16" })]);
    expect(r.claimTypeLabel).toBe("T16");
  });

  it("skips rows with empty CASE LINK", () => {
    const result = parsed([row({ "CASE LINK": "" })]);
    expect(result).toHaveLength(0);
  });
});

// ─── Date parsing ─────────────────────────────────────────────────────────────

describe("approval date", () => {
  it("parses YYYY-MM-DD", () => {
    const [r] = parsed([row({ "APPROVAL DATE": "2024-03-15" })]);
    expect(r.approvalDate).toBe("2024-03-15");
  });

  it("parses MM/DD/YYYY", () => {
    const [r] = parsed([row({ "APPROVAL DATE": "03/15/2024" })]);
    expect(r.approvalDate).toBe("2024-03-15");
  });

  it("parses MM/DD/YY", () => {
    const [r] = parsed([row({ "APPROVAL DATE": "3/15/24" })]);
    expect(r.approvalDate).toBe("2024-03-15");
  });

  it("parses YYYY/MM/DD", () => {
    const [r] = parsed([row({ "APPROVAL DATE": "2024/03/15" })]);
    expect(r.approvalDate).toBe("2024-03-15");
  });

  it("stores null and emits warning for long-form date", () => {
    const ws = warnings([row({ "APPROVAL DATE": "March 15, 2024" })]);
    const w = ws.find((w) => w.message.includes("Approval date"));
    expect(w).toBeDefined();
    expect(w!.message).toMatch(/could not be parsed/);
    const [r] = parsed([row({ "APPROVAL DATE": "March 15, 2024" })]);
    expect(r.approvalDate).toBeNull();
  });

  it("stores null and emits warning for partial date", () => {
    const ws = warnings([row({ "APPROVAL DATE": "3-15-24" })]);
    expect(ws.some((w) => w.message.includes("Approval date"))).toBe(true);
  });

  it("does not warn when APPROVAL DATE is blank", () => {
    const ws = warnings([row({ "APPROVAL DATE": "" })]);
    expect(ws.some((w) => w.message.includes("Approval date"))).toBe(false);
  });

  it("does not warn when APPROVAL DATE is absent", () => {
    const r = row();
    delete r["APPROVAL DATE"];
    expect(warnings([r]).some((w) => w.message.includes("Approval date"))).toBe(false);
  });
});

// ─── Claim type ───────────────────────────────────────────────────────────────

describe("claim type", () => {
  it("emits warning for unrecognized value", () => {
    const ws = warnings([row({ "CLAIM TYPE": "CONCURRENT" })]);
    const w = ws.find((w) => w.message.includes("Unrecognized claim type"));
    expect(w).toBeDefined();
    expect(w!.message).toContain("CONCURRENT");
  });

  it("emits warning for numeric claim type", () => {
    const ws = warnings([row({ "CLAIM TYPE": "T3" })]);
    expect(ws.some((w) => w.message.includes("Unrecognized claim type"))).toBe(true);
  });

  it("does not warn when claim type is empty", () => {
    const ws = warnings([row({ "CLAIM TYPE": "" })]);
    expect(ws.some((w) => w.message.includes("Unrecognized claim type"))).toBe(false);
  });

  it("does not warn for any known variant", () => {
    for (const ct of ["T2", "T16", "CONC", "T2/T16", "T2 T16", "T2_T16"]) {
      expect(
        warnings([row({ "CLAIM TYPE": ct })]).some((w) => w.message.includes("Unrecognized claim type")),
        `Expected no warning for "${ct}"`
      ).toBe(false);
    }
  });
});

// ─── CASE LINK name parsing ───────────────────────────────────────────────────

describe("CASE LINK name parsing", () => {
  it("emits warning when no comma separates last and first name", () => {
    const ws = warnings([row({ "CASE LINK": "2024.01.15 SmithJohn v. ALJ Doe" })]);
    expect(ws.some((w) => w.message.includes("Could not parse name"))).toBe(true);
  });

  it("emits warning when there is no v separator", () => {
    const ws = warnings([row({ "CASE LINK": "2024.01.15 Smith John" })]);
    expect(ws.some((w) => w.message.includes('No "v" separator found'))).toBe(true);
  });

  it("falls back to Unknown when name cannot be parsed", () => {
    const [r] = parsed([row({ "CASE LINK": "2024.01.15 SmithJohn v. ALJ Doe" })]);
    expect(r.firstName).toBe("Unknown");
  });

  it("does not warn for a well-formed CASE LINK", () => {
    const ws = warnings([row()]);
    expect(ws.some((w) => w.message.includes("Could not parse name"))).toBe(false);
  });
});

// ─── Synthetic ID assignment ──────────────────────────────────────────────────

describe("synthetic ID", () => {
  it("emits warning when CASE LINK_url is absent", () => {
    const ws = warnings([row({ "CASE LINK_url": null })]);
    const w = ws.find((w) => w.message.includes("No valid MyCase URL"));
    expect(w).toBeDefined();
  });

  it("emits warning when URL does not contain a mycase.com court_cases path", () => {
    const ws = warnings([row({ "CASE LINK_url": "https://example.com/case/99" })]);
    expect(ws.some((w) => w.message.includes("No valid MyCase URL"))).toBe(true);
  });

  it("assigns a clientId >= SYNTHETIC_ID_BASE when no URL", () => {
    const [r] = parsed([row({ "CASE LINK_url": null })]);
    expect(r.clientId).toBeGreaterThanOrEqual(SYNTHETIC_ID_BASE);
  });

  it("emits duplicate-ID warning and assigns synthetic for second row with same MyCase id", () => {
    const ws = warnings([
      row({ "CASE LINK_url": "https://app.mycase.com/court_cases/99999" }),
      row({ "CASE LINK_url": "https://app.mycase.com/court_cases/99999", "CASE LINK": "2024.02.01 Jones, Mary v. ALJ Smith" }),
    ]);
    expect(ws.some((w) => w.message.includes("Duplicate MyCase id"))).toBe(true);
  });

  it("second duplicate row gets a synthetic clientId", () => {
    const rows = parsed([
      row({ "CASE LINK_url": "https://app.mycase.com/court_cases/99999" }),
      row({ "CASE LINK_url": "https://app.mycase.com/court_cases/99999", "CASE LINK": "2024.02.01 Jones, Mary v. ALJ Smith" }),
    ]);
    expect(rows[0].clientId).toBe(99999);
    expect(rows[1].clientId).toBeGreaterThanOrEqual(SYNTHETIC_ID_BASE);
  });

  it("does not emit synthetic warning for a valid unique MyCase URL", () => {
    const ws = warnings([row()]);
    expect(ws.some((w) => w.message.includes("No valid MyCase URL"))).toBe(false);
    expect(ws.some((w) => w.message.includes("Duplicate MyCase id"))).toBe(false);
  });
});

// ─── Amount parsing ───────────────────────────────────────────────────────────

describe("monetary amounts", () => {
  it("strips dollar signs and commas", () => {
    const [r] = parsed([row({ "T2 RETRO": "$12,500.00" })]);
    expect(r.t2Retro).toBe("12500");
  });

  it("handles plain integers", () => {
    const [r] = parsed([row({ "T2 RETRO": 48000 })]);
    expect(r.t2Retro).toBe("48000");
  });

  it("coerces blank to 0", () => {
    const [r] = parsed([row({ "T2 RETRO": "" })]);
    expect(r.t2Retro).toBe("0");
  });

  it("coerces non-numeric text to 0", () => {
    const [r] = parsed([row({ "T2 RETRO": "N/A" })]);
    expect(r.t2Retro).toBe("0");
  });
});

// ─── Warning row numbers ──────────────────────────────────────────────────────

describe("warning row numbers", () => {
  it("row number is 1-indexed with header offset (first data row = row 2)", () => {
    const ws = warnings([row({ "CASE LINK_url": null })]);
    expect(ws[0].row).toBe(2);
  });

  it("row number increments correctly for later rows", () => {
    const ws = warnings([
      row(),
      row({ "CASE LINK_url": null, "CASE LINK": "2024.02.01 Jones, Mary v. ALJ Smith" }),
    ]);
    const w = ws.find((w) => w.message.includes("No valid MyCase URL"));
    expect(w!.row).toBe(3);
  });
});

// ─── Multiple issues in one row ───────────────────────────────────────────────

describe("multiple malformed fields", () => {
  it("collects all warnings for a single bad row", () => {
    const ws = warnings([
      row({
        "CASE LINK_url": null,
        "APPROVAL DATE": "March 15 2024",
        "CLAIM TYPE": "UNKNOWN_TYPE",
        "CASE LINK": "2024.01.15 SmithJohn v. ALJ Doe",
      }),
    ]);
    expect(ws.some((w) => w.message.includes("No valid MyCase URL"))).toBe(true);
    expect(ws.some((w) => w.message.includes("Approval date"))).toBe(true);
    expect(ws.some((w) => w.message.includes("Unrecognized claim type"))).toBe(true);
    expect(ws.some((w) => w.message.includes("Could not parse name"))).toBe(true);
  });
});
