import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorksheet } from "../xlsx-mapper";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const HEADERS = [
  "CASE LINK",
  "ASSIGNED TO",
  "CASE LEVEL",
  "CLAIM TYPE",
  "APPROVAL DATE",
  "WIN SHEET STATUS",
  "WIN SHEET LINK",
  "FEES CONFIRMATION",
  "CASE STATUS",
  "APPROVED BY (OK TO CLOSE)",
  "T16 RETRO",
  "T16 FEE DUE",
  "T16 FEE $ REC'D",
  "T16 PENDING",
  "DATE T16 FEE REC'D",
  "T2 RETRO",
  "T2 FEE DUE",
  "T2 FEE $ REC'D",
  "T2 PENDING",
  "DATE T2 FEE REC'D",
  "RETRO AUX",
  "AUX FEE DUE",
  "AUX FEE $ REC'D",
  "AUX PENDING",
  "DATE AUX FEE REC'D",
  "COLLECTION NOTES",
  "DATE ASSIGNED TO AGENT",
];

type RowValues = (string | number | Date | null)[];

const buildBuffer = (
  rows: RowValues[],
  sheetName = "MASTER LIST",
  addHyperlinks?: (ws: XLSX.WorkSheet) => void,
): Buffer => {
  const aoa = [HEADERS, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  if (addHyperlinks) addHyperlinks(ws);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
};

// Full zero-value row with only a CASE LINK set
const blankRow = (caseLink: string): RowValues => [
  caseLink, // CASE LINK
  null,     // ASSIGNED TO
  null,     // CASE LEVEL
  null,     // CLAIM TYPE
  null,     // APPROVAL DATE
  null,     // WIN SHEET STATUS
  null,     // WIN SHEET LINK
  null,     // FEES CONFIRMATION
  null,     // CASE STATUS
  null,     // APPROVED BY
  0, 0, 0, 0, null, // T16
  0, 0, 0, 0, null, // T2
  0, 0, 0, 0, null, // AUX
  null,     // COLLECTION NOTES
  null,     // DATE ASSIGNED TO AGENT
];

// ---------------------------------------------------------------------------
// 1. Normal workbook — 3 representative rows
// ---------------------------------------------------------------------------

describe("parseWorksheet — normal workbook", () => {
  const buf = buildBuffer([
    // T2 row — MyCase link, claim T2, date, fee amounts
    [
      "2023.04.10 Smith, John v. ALJ Brown",
      "Jane Doe",
      "HEARING",
      "T2",
      "2023-04-10",
      "paid in full",
      "Win Sheet Link Text",
      "PIF123",
      "Active",
      "Jane Doe",
      0, 6000, 6000, 0, "2023-05-01",
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      "Initial note",
      "2023-04-15",
    ],
    // T16 row
    [
      "2022.11.20 Garcia, Maria v. ALJ Jones",
      "Bob Lee",
      "INITIAL",
      "T16",
      "2022-11-20",
      "in progress",
      null,
      null,
      null,
      null,
      5000, 1000, 500, 500, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      null,
      null,
    ],
    // CONCURRENT row
    [
      "2024.01.05 Lee, Kim v. ALJ Davis",
      null,
      "AC",
      "CONC",
      null,
      "not started",
      null,
      null,
      null,
      null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      null,
      null,
    ],
  ]);

  it("returns 3 rows", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows).toHaveLength(3);
  });

  it("parses T2 row — names, claim type, level", () => {
    const { rows } = parseWorksheet(buf);
    const row = rows[0];
    expect(row.lastName).toBe("Smith");
    expect(row.firstName).toBe("John");
    expect(row.claimTypeLabel).toBe("T2");
    expect(row.levelWon).toBe("HEARING");
  });

  it("parses T2 row — fee amounts", () => {
    const { rows } = parseWorksheet(buf);
    const row = rows[0];
    expect(row.t16FeeDue).toBe("6000");
    expect(row.t16FeeReceived).toBe("6000");
    expect(row.t16Pending).toBe("0");
  });

  it("parses T2 row — dates", () => {
    const { rows } = parseWorksheet(buf);
    const row = rows[0];
    expect(row.approvalDate).toBe("2023-04-10");
    expect(row.t16FeeReceivedDate).toBe("2023-05-01");
    expect(row.dateAssignedToAgent).toBe("2023-04-15");
  });

  it("parses T2 row — assigned and win sheet status", () => {
    const { rows } = parseWorksheet(buf);
    const row = rows[0];
    expect(row.assignedTo).toBe("Jane Doe");
    expect(row.winSheetStatus).toBe("paid_in_full");
    expect(row.notes).toBe("Initial note");
  });

  it("parses T16 row — claim type and level", () => {
    const { rows } = parseWorksheet(buf);
    const row = rows[1];
    expect(row.claimTypeLabel).toBe("T16");
    expect(row.levelWon).toBe("INITIAL");
    expect(row.winSheetStatus).toBe("in_progress");
  });

  it("parses CONC row — T2_T16 claim type", () => {
    const { rows } = parseWorksheet(buf);
    const row = rows[2];
    expect(row.claimTypeLabel).toBe("T2_T16");
    expect(row.claimType).toEqual(["T2", "T16"]);
    expect(row.levelWon).toBe("AC");
    expect(row.approvalDate).toBeNull();
  });

  it("produces no warnings for valid rows", () => {
    const { warnings } = parseWorksheet(buf);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Date-cell handling
// ---------------------------------------------------------------------------

describe("parseWorksheet — date cells", () => {
  // When SheetJS reads an xlsx with cellDates:true it converts date-formatted
  // cells to JS Date objects before the mapper sees them. We therefore use
  // Date objects in the fixture to match that runtime path exactly.
  const DATE_MARCH = new Date("2024-03-15");
  const DATE_JUNE = new Date("2024-06-20");

  const buf = buildBuffer([
    [
      "2024.03.15 Adams, Alice v. ALJ Smith",
      null, "HEARING", "T2",
      DATE_MARCH, // JS Date — represents an Excel date-formatted cell after cellDates conversion
      null, null, null, null, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      null, null,
    ],
    [
      "2024.06.20 Brooks, Bob v. ALJ White",
      null, "RECON", "T16",
      DATE_JUNE, // a second Date value
      null, null, null, null, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      null, null,
    ],
    [
      "2023.12.01 Chen, Carol v. SSA",
      null, "INITIAL", "T2",
      "12/1/2023", // text date string M/D/YYYY
      null, null, null, null, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      0, 0, 0, 0, null,
      null, null,
    ],
  ]);

  it("normalises a Date-object cell (from xlsx cellDates conversion) to YYYY-MM-DD", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[0].approvalDate).toBe("2024-03-15");
  });

  it("normalises a second JS Date to YYYY-MM-DD", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[1].approvalDate).toBe("2024-06-20");
  });

  it("normalises a text M/D/YYYY date to YYYY-MM-DD", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[2].approvalDate).toBe("2023-12-01");
  });
});

// ---------------------------------------------------------------------------
// 3. Hyperlink extraction
// ---------------------------------------------------------------------------

describe("parseWorksheet — hyperlinks", () => {
  const MY_CASE_URL = "https://rgdr.mycase.com/court_cases/12345678";
  const WIN_SHEET_URL = "https://docs.google.com/spreadsheets/d/abc123";

  const buf = buildBuffer(
    [
      [
        "2023.07.01 Nguyen, Nhu v. ALJ Miller",
        null, "HEARING", "T2",
        null, "paid in full", "Win Sheet Text", null, null, null,
        0, 5000, 5000, 0, null,
        0, 0, 0, 0, null,
        0, 0, 0, 0, null,
        null, null,
      ],
    ],
    "MASTER LIST",
    (ws) => {
      // Row index 1 (0-based) is the first data row (row 0 is the header)
      const caseLinkAddr = XLSX.utils.encode_cell({ r: 1, c: 0 }); // CASE LINK col
      const winSheetAddr = XLSX.utils.encode_cell({ r: 1, c: 6 }); // WIN SHEET LINK col
      ws[caseLinkAddr] = { ...ws[caseLinkAddr], l: { Target: MY_CASE_URL } };
      ws[winSheetAddr] = { ...ws[winSheetAddr], l: { Target: WIN_SHEET_URL } };
    },
  );

  it("extracts MyCase clientId from hyperlink on CASE LINK", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[0].clientId).toBe(12345678);
  });

  it("stores the MyCase URL as externalId", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[0].externalId).toBe(MY_CASE_URL);
  });

  it("extracts the win sheet URL from hyperlink on WIN SHEET LINK", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[0].winSheetLink).toBe(WIN_SHEET_URL);
  });

  it("retains the win sheet visible text separately", () => {
    const { rows } = parseWorksheet(buf);
    expect(rows[0].winSheetLinkText).toBe("Win Sheet Text");
  });
});

// ---------------------------------------------------------------------------
// 4. Malformed / edge-case workbooks
// ---------------------------------------------------------------------------

describe("parseWorksheet — malformed workbooks", () => {
  it("returns empty rows and a warning for a sheet with only a header", () => {
    const buf = buildBuffer([]); // header only, no data rows
    const { rows, warnings } = parseWorksheet(buf);
    expect(rows).toHaveLength(0);
    expect(warnings).toHaveLength(0); // aoa.length < 2 returns early, no rows
  });

  it("skips rows where CASE LINK is blank", () => {
    const buf = buildBuffer([
      blankRow(""), // blank CASE LINK — should be skipped
      blankRow("2023.01.01 Doe, Jane v. ALJ Lee"),
    ]);
    const { rows } = parseWorksheet(buf);
    expect(rows).toHaveLength(1);
  });

  it("falls back to synthetic ID when no MyCase URL is present", () => {
    const buf = buildBuffer([
      blankRow("2023.01.01 Doe, Jane v. ALJ Lee"), // no hyperlink
    ]);
    const { rows } = parseWorksheet(buf);
    expect(rows[0].clientId).toBeGreaterThanOrEqual(900_000_000);
    expect(rows[0].externalId).toBeNull();
  });

  it("emits a warning and assigns a new synthetic ID for duplicate MyCase IDs", () => {
    const SAME_URL = "https://rgdr.mycase.com/court_cases/99999";
    const buf = buildBuffer(
      [
        blankRow("2023.01.01 Doe, Jane v. ALJ Lee"),
        blankRow("2023.02.01 Smith, Bob v. ALJ Green"),
      ],
      "MASTER LIST",
      (ws) => {
        ws[XLSX.utils.encode_cell({ r: 1, c: 0 })] = {
          v: "2023.01.01 Doe, Jane v. ALJ Lee",
          t: "s",
          l: { Target: SAME_URL },
        };
        ws[XLSX.utils.encode_cell({ r: 2, c: 0 })] = {
          v: "2023.02.01 Smith, Bob v. ALJ Green",
          t: "s",
          l: { Target: SAME_URL },
        };
      },
    );
    const { rows, warnings } = parseWorksheet(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0].clientId).toBe(99999);
    expect(rows[1].clientId).not.toBe(99999);
    expect(warnings.some((w) => w.message.includes("Duplicate MyCase id"))).toBe(true);
  });

  it("uses the first sheet when 'MASTER LIST' tab is absent", () => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, blankRow("2023.03.01 Doe, Jane v. ALJ Lee")]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "OTHER SHEET");
    const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const { rows } = parseWorksheet(buf);
    expect(rows).toHaveLength(1);
  });

  it("coerces missing/null monetary values to '0'", () => {
    const buf = buildBuffer([blankRow("2023.04.01 Doe, Jane v. ALJ Lee")]);
    const { rows } = parseWorksheet(buf);
    expect(rows[0].t16Retro).toBe("0");
    expect(rows[0].t2FeeDue).toBe("0");
    expect(rows[0].auxFeeReceived).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// 5. Large workbook — row count parity
// ---------------------------------------------------------------------------

describe("parseWorksheet — large workbook", () => {
  const ROW_COUNT = 100;

  const rows: RowValues[] = Array.from({ length: ROW_COUNT }, (_, i) => [
    `2023.01.01 Last${i}, First${i} v. ALJ Judge${i}`,
    `Agent ${i % 5}`,
    "HEARING",
    i % 3 === 0 ? "T2" : i % 3 === 1 ? "T16" : "CONC",
    "2023-01-01",
    "in progress",
    null, null, null, null,
    1000, 500, 250, 250, null,
    500, 200, 100, 100, null,
    200, 100, 50, 50, null,
    null, null,
  ]);

  const buf = buildBuffer(rows);

  it(`parses all ${ROW_COUNT} rows without error`, () => {
    const result = parseWorksheet(buf);
    expect(result.rows).toHaveLength(ROW_COUNT);
    expect(result.warnings).toHaveLength(0);
  });

  it("correctly parses the last row's name", () => {
    const { rows: parsed } = parseWorksheet(buf);
    const last = parsed[ROW_COUNT - 1];
    expect(last.lastName).toBe(`Last${ROW_COUNT - 1}`);
    expect(last.firstName).toBe(`First${ROW_COUNT - 1}`);
  });

  it("assigns distinct clientIds to all rows (all synthetic since no hyperlinks)", () => {
    const { rows: parsed } = parseWorksheet(buf);
    const ids = parsed.map((r) => r.clientId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ROW_COUNT);
  });
});
