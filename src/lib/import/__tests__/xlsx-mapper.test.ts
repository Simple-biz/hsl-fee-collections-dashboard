import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
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

type CellValue = string | number | Date | null;
type RowValues = CellValue[];

const buildBuffer = async (
  rows: RowValues[],
  sheetName = "MASTER LIST",
  addHyperlinks?: (ws: ExcelJS.Worksheet) => void,
): Promise<Buffer> => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(HEADERS);
  for (const row of rows) ws.addRow(row);
  if (addHyperlinks) addHyperlinks(ws);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
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
  let buf: Buffer;

  beforeAll(async () => {
    buf = await buildBuffer([
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
  });

  it("returns 3 rows", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows).toHaveLength(3);
  });

  it("parses T2 row — names, claim type, level", async () => {
    const { rows } = await parseWorksheet(buf);
    const row = rows[0];
    expect(row.lastName).toBe("Smith");
    expect(row.firstName).toBe("John");
    expect(row.claimTypeLabel).toBe("T2");
    expect(row.levelWon).toBe("HEARING");
  });

  it("parses T2 row — fee amounts", async () => {
    const { rows } = await parseWorksheet(buf);
    const row = rows[0];
    expect(row.t16FeeDue).toBe("6000");
    expect(row.t16FeeReceived).toBe("6000");
    expect(row.t16Pending).toBe("0");
  });

  it("parses T2 row — dates", async () => {
    const { rows } = await parseWorksheet(buf);
    const row = rows[0];
    expect(row.approvalDate).toBe("2023-04-10");
    expect(row.t16FeeReceivedDate).toBe("2023-05-01");
    expect(row.dateAssignedToAgent).toBe("2023-04-15");
  });

  it("parses T2 row — assigned and win sheet status", async () => {
    const { rows } = await parseWorksheet(buf);
    const row = rows[0];
    expect(row.assignedTo).toBe("Jane Doe");
    expect(row.winSheetStatus).toBe("paid_in_full");
    expect(row.notes).toBe("Initial note");
  });

  it("parses T16 row — claim type and level", async () => {
    const { rows } = await parseWorksheet(buf);
    const row = rows[1];
    expect(row.claimTypeLabel).toBe("T16");
    expect(row.levelWon).toBe("INITIAL");
    expect(row.winSheetStatus).toBe("in_progress");
  });

  it("parses CONC row — T2_T16 claim type", async () => {
    const { rows } = await parseWorksheet(buf);
    const row = rows[2];
    expect(row.claimTypeLabel).toBe("T2_T16");
    expect(row.claimType).toEqual(["T2", "T16"]);
    expect(row.levelWon).toBe("AC");
    expect(row.approvalDate).toBeNull();
  });

  it("produces no warnings for valid rows", async () => {
    const { warnings } = await parseWorksheet(buf);
    expect(warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Date-cell handling
// ---------------------------------------------------------------------------

describe("parseWorksheet — date cells", () => {
  // exceljs writes Date objects as date-formatted cells and reads them back
  // as Date objects, mirroring the xlsx cellDates:true runtime path.
  const DATE_MARCH = new Date("2024-03-15");
  const DATE_JUNE = new Date("2024-06-20");

  let buf: Buffer;

  beforeAll(async () => {
    buf = await buildBuffer([
      [
        "2024.03.15 Adams, Alice v. ALJ Smith",
        null, "HEARING", "T2",
        DATE_MARCH,
        null, null, null, null, null,
        0, 0, 0, 0, null,
        0, 0, 0, 0, null,
        0, 0, 0, 0, null,
        null, null,
      ],
      [
        "2024.06.20 Brooks, Bob v. ALJ White",
        null, "RECON", "T16",
        DATE_JUNE,
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
  });

  it("normalises a Date-object cell to YYYY-MM-DD", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[0].approvalDate).toBe("2024-03-15");
  });

  it("normalises a second JS Date to YYYY-MM-DD", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[1].approvalDate).toBe("2024-06-20");
  });

  it("normalises a text M/D/YYYY date to YYYY-MM-DD", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[2].approvalDate).toBe("2023-12-01");
  });
});

// ---------------------------------------------------------------------------
// 3. Hyperlink extraction
// ---------------------------------------------------------------------------

describe("parseWorksheet — hyperlinks", () => {
  const MY_CASE_URL = "https://rgdr.mycase.com/court_cases/12345678";
  const WIN_SHEET_URL = "https://docs.google.com/spreadsheets/d/abc123";

  let buf: Buffer;

  beforeAll(async () => {
    buf = await buildBuffer(
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
        // exceljs rows are 1-indexed; row 2 = first data row (row 1 is header)
        // Set hyperlink on CASE LINK (col 1) and WIN SHEET LINK (col 7)
        const caseLinkCell = ws.getCell(2, 1);
        caseLinkCell.value = { text: String(caseLinkCell.value ?? ""), hyperlink: MY_CASE_URL };
        const winSheetCell = ws.getCell(2, 7);
        winSheetCell.value = { text: String(winSheetCell.value ?? "Win Sheet Text"), hyperlink: WIN_SHEET_URL };
      },
    );
  });

  it("extracts MyCase clientId from hyperlink on CASE LINK", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[0].clientId).toBe(12345678);
  });

  it("stores the MyCase URL as externalId", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[0].externalId).toBe(MY_CASE_URL);
  });

  it("extracts the win sheet URL from hyperlink on WIN SHEET LINK", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[0].winSheetLink).toBe(WIN_SHEET_URL);
  });

  it("retains the win sheet visible text separately", async () => {
    const { rows } = await parseWorksheet(buf);
    expect(rows[0].winSheetLinkText).toBe("Win Sheet Text");
  });
});

// ---------------------------------------------------------------------------
// 4. Malformed / edge-case workbooks
// ---------------------------------------------------------------------------

describe("parseWorksheet — malformed workbooks", () => {
  it("returns empty rows for a sheet with only a header", async () => {
    const buf = await buildBuffer([]);
    const { rows, warnings } = await parseWorksheet(buf);
    expect(rows).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("skips rows where CASE LINK is blank", async () => {
    const buf = await buildBuffer([
      blankRow(""), // blank CASE LINK — should be skipped
      blankRow("2023.01.01 Doe, Jane v. ALJ Lee"),
    ]);
    const { rows } = await parseWorksheet(buf);
    expect(rows).toHaveLength(1);
  });

  it("falls back to synthetic ID when no MyCase URL is present", async () => {
    const buf = await buildBuffer([blankRow("2023.01.01 Doe, Jane v. ALJ Lee")]);
    const { rows } = await parseWorksheet(buf);
    expect(rows[0].clientId).toBeGreaterThanOrEqual(900_000_000);
    expect(rows[0].externalId).toBeNull();
  });

  it("emits a warning and assigns a new synthetic ID for duplicate MyCase IDs", async () => {
    const SAME_URL = "https://rgdr.mycase.com/court_cases/99999";
    const buf = await buildBuffer(
      [
        blankRow("2023.01.01 Doe, Jane v. ALJ Lee"),
        blankRow("2023.02.01 Smith, Bob v. ALJ Green"),
      ],
      "MASTER LIST",
      (ws) => {
        const cell1 = ws.getCell(2, 1);
        cell1.value = { text: String(cell1.value ?? ""), hyperlink: SAME_URL };
        const cell2 = ws.getCell(3, 1);
        cell2.value = { text: String(cell2.value ?? ""), hyperlink: SAME_URL };
      },
    );
    const { rows, warnings } = await parseWorksheet(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0].clientId).toBe(99999);
    expect(rows[1].clientId).not.toBe(99999);
    expect(warnings.some((w) => w.message.includes("Duplicate MyCase id"))).toBe(true);
  });

  it("uses the first sheet when 'MASTER LIST' tab is absent", async () => {
    const buf = await buildBuffer(
      [blankRow("2023.03.01 Doe, Jane v. ALJ Lee")],
      "OTHER SHEET",
    );
    const { rows } = await parseWorksheet(buf);
    expect(rows).toHaveLength(1);
  });

  it("coerces missing/null monetary values to '0'", async () => {
    const buf = await buildBuffer([blankRow("2023.04.01 Doe, Jane v. ALJ Lee")]);
    const { rows } = await parseWorksheet(buf);
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
  let buf: Buffer;

  beforeAll(async () => {
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
    buf = await buildBuffer(rows);
  });

  it(`parses all ${ROW_COUNT} rows without error`, async () => {
    const result = await parseWorksheet(buf);
    expect(result.rows).toHaveLength(ROW_COUNT);
    expect(result.warnings).toHaveLength(0);
  });

  it("correctly parses the last row's name", async () => {
    const { rows: parsed } = await parseWorksheet(buf);
    const last = parsed[ROW_COUNT - 1];
    expect(last.lastName).toBe(`Last${ROW_COUNT - 1}`);
    expect(last.firstName).toBe(`First${ROW_COUNT - 1}`);
  });

  it("assigns distinct clientIds to all rows (all synthetic since no hyperlinks)", async () => {
    const { rows: parsed } = await parseWorksheet(buf);
    const ids = parsed.map((r) => r.clientId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ROW_COUNT);
  });
});
