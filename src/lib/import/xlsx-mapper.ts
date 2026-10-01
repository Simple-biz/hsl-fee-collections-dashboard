import ExcelJS from "exceljs";

export interface ParsedCaseRow {
  clientId: number;
  externalId: string | null;
  caseLink: string;
  firstName: string;
  lastName: string;
  approvalDate: string | null;
  levelWon:
    | "INITIAL"
    | "RECON"
    | "HEARING"
    | "AC"
    | "FEDERAL_COURT"
    | "FEE_PETITION"
    | null;
  claimType: string[];
  claimTypeLabel: "T2" | "T16" | "T2_T16" | null;
  aljFirstName: string | null;
  aljLastName: string | null;

  // Fee record
  assignedTo: string | null;
  winSheetStatus:
    | "not_started"
    | "started"
    | "in_progress"
    | "pending_payment"
    | "partially_paid"
    | "paid_in_full"
    | "closed";
  winSheetLink: string | null; // URL if cell is hyperlinked, else the visible text
  winSheetLinkText: string | null; // visible text shown in the cell
  caseStatus: string | null;
  feesConfirmation: string | null;
  dateAssignedToAgent: string | null;
  approvedBy: string | null;

  t16Retro: string;
  t16FeeDue: string;
  t16FeeReceived: string;
  t16Pending: string;
  t16FeeReceivedDate: string | null;

  t2Retro: string;
  t2FeeDue: string;
  t2FeeReceived: string;
  t2Pending: string;
  t2FeeReceivedDate: string | null;

  auxRetro: string;
  auxFeeDue: string;
  auxFeeReceived: string;
  auxPending: string;
  auxFeeReceivedDate: string | null;

  // Sheet-computed fields
  daysAfterApproval: number | null;
  approvalCategory: string | null;
  feesStatus: string | null;
  weekAssignedToAgent: string | null;
  monthAssignedToAgent: string | null;

  t2Decision: "fully_favorable" | "partially_favorable" | "unfavorable" | "dismissed" | "remand" | "unknown";
  t16Decision: "fully_favorable" | "partially_favorable" | "unfavorable" | "dismissed" | "remand" | "unknown";

  // Notes — entire raw blob, stored as one activity_log entry per case
  notes: string | null;
}

export interface ParseResult {
  rows: ParsedCaseRow[];
  warnings: { row: number; message: string }[];
}

const MYCASE_URL_RE = /mycase\.com\/court_cases\/(\d+)/i;
const SYNTHETIC_ID_BASE = 900_000_000;

const num = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "0";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, $]/g, ""));
  return Number.isFinite(n) ? String(n) : "0";
};

const dateOnly = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  // YYYY-MM-DD or YYYY/MM/DD
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // M/D/YY or MM/DD/YYYY
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m2) {
    const yy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${yy}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }
  return null;
};

const stripTrailingAnnotations = (s: string): string => {
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s*[([][^)\]]*[)\]]\s*$/, "").trim();
  } while (s !== prev);
  return s;
};

const parseCaseLink = (
  link: string,
): {
  firstName: string;
  lastName: string;
  aljFirstName: string | null;
  aljLastName: string | null;
} => {
  let s = link.trim();
  s = s.replace(/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s+/, "");
  const parts = s.split(/\s+vs?(?:[.,]\s*|\s+)/i);
  const left = parts[0] || "";
  const right = parts[1] || "";

  const leftClean = stripTrailingAnnotations(left);
  let lastRaw: string, firstRaw: string;
  if (leftClean.includes(",")) {
    [lastRaw, firstRaw] = leftClean.split(/,\s*/);
  } else {
    const tokens = leftClean.split(/\s+/);
    lastRaw = tokens[0] ?? leftClean;
    firstRaw = tokens.slice(1).join(" ");
  }
  const lastName = (lastRaw || leftClean).trim();
  const firstName = (firstRaw || "").trim();

  let aljFirstName: string | null = null;
  let aljLastName: string | null = null;
  const aljClean = stripTrailingAnnotations(right.replace(/^ALJ\s+/i, ""));
  if (aljClean && !/^SSA$/i.test(aljClean)) {
    const tokens = aljClean.split(/\s+/);
    if (tokens.length >= 2) {
      aljFirstName = tokens[0];
      aljLastName = tokens.slice(1).join(" ");
    } else {
      aljLastName = tokens[0] ?? null;
    }
  }

  return { firstName, lastName, aljFirstName, aljLastName };
};

const mapClaimType = (
  raw: unknown,
): {
  claimType: string[];
  claimTypeLabel: "T2" | "T16" | "T2_T16" | null;
} => {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!s) return { claimType: [], claimTypeLabel: null };
  if (s === "CONC" || s === "T2/T16" || s === "T2 T16" || s === "T2_T16") {
    return { claimType: ["T2", "T16"], claimTypeLabel: "T2_T16" };
  }
  if (s === "T16") return { claimType: ["T16"], claimTypeLabel: "T16" };
  if (s === "T2") return { claimType: ["T2"], claimTypeLabel: "T2" };
  return { claimType: [s], claimTypeLabel: null };
};

const mapLevelWon = (raw: unknown): ParsedCaseRow["levelWon"] => {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (
    s === "INITIAL" ||
    s === "RECON" ||
    s === "HEARING" ||
    s === "AC" ||
    s === "FEDERAL_COURT" ||
    s === "FEE_PETITION"
  )
    return s;
  return null;
};

const mapWinSheetStatus = (raw: unknown): ParsedCaseRow["winSheetStatus"] => {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "not_started";
  if (s === "finished") return "closed";
  if (s === "not started" || s === "not_started") return "not_started";
  if (s.includes("started")) return "started";
  if (s === "in progress" || s === "in_progress") return "in_progress";
  if (s === "pending payment") return "pending_payment";
  if (s === "partially paid") return "partially_paid";
  if (s === "paid in full") return "paid_in_full";
  if (s === "closed") return "closed";
  return "started";
};

// Extract the cell's display text as a plain string.
const cellText = (cell: ExcelJS.Cell | null): string => {
  if (!cell) return "";
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    // Hyperlink value { text, hyperlink }
    if ("hyperlink" in v && "text" in v) {
      const text = (v as { text: string | ExcelJS.CellRichTextValue; hyperlink: string }).text;
      if (typeof text === "string") return text;
      if (typeof text === "object" && "richText" in text) {
        return (text as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
      }
      return String(text);
    }
    // RichText
    if ("richText" in v) {
      return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    }
    // Shared formula / formula result
    if ("result" in v) {
      const res = (v as ExcelJS.CellFormulaValue).result;
      if (res === null || res === undefined) return "";
      if (typeof res === "string") return res;
      if (typeof res === "number" || typeof res === "boolean") return String(res);
      if (res instanceof Date) return res.toISOString();
      return String(res);
    }
  }
  return String(v);
};

// Extract the cell's numeric/date value for monetary and date columns.
const cellRaw = (cell: ExcelJS.Cell | null): unknown => {
  if (!cell) return null;
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    // Hyperlink value — extract the display text for numeric coercion
    if ("hyperlink" in v && "text" in v) {
      const text = (v as { text: string | ExcelJS.CellRichTextValue }).text;
      if (typeof text === "string") return text;
      if (typeof text === "object" && "richText" in text) {
        return (text as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
      }
      return String(text);
    }
  }
  return v;
};

// Extract the hyperlink URL from a cell, if present.
const cellHyperlink = (cell: ExcelJS.Cell | null): string | null => {
  if (!cell) return null;
  const h = cell.hyperlink;
  if (!h) return null;
  if (typeof h === "string") return h;
  // ExcelJS.CellHyperlinkValue has { hyperlink: string; tooltip?: string }
  if (typeof h === "object" && "hyperlink" in h) {
    return (h as { hyperlink: string }).hyperlink ?? null;
  }
  return null;
};

export const parseWorksheet = async (buffer: Buffer): Promise<ParseResult> => {
  const wb = new ExcelJS.Workbook();
  // exceljs bundles its own (older) @types/node via a transitive dep whose
  // Buffer type structurally conflicts — the runtime value is a plain Buffer.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);

  const ws =
    wb.getWorksheet("MASTER LIST") ?? wb.getWorksheet(wb.worksheets[0]?.name);
  if (!ws) return { rows: [], warnings: [{ row: 0, message: "No sheet found" }] };

  // Row 1 is the header; exceljs rows are 1-indexed.
  const headerRow = ws.getRow(1);
  const header: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    header[colNumber - 1] = cellText(cell).trim().toUpperCase();
  });

  const idx = (name: string) => header.indexOf(name.toUpperCase());

  const C = {
    caseLink: idx("CASE LINK"),
    assignedTo: idx("ASSIGNED TO"),
    caseLevel: idx("CASE LEVEL"),
    claimType: idx("CLAIM TYPE"),
    approvalDate: idx("APPROVAL DATE"),
    winSheetStatus: idx("WIN SHEET STATUS"),
    winSheetLink: idx("WIN SHEET LINK"),
    feesConfirmation: idx("FEES CONFIRMATION"),
    caseStatus: idx("CASE STATUS"),
    approvedBy: idx("APPROVED BY (OK TO CLOSE)"),
    t16Retro: idx("T16 RETRO"),
    t16FeeDue: idx("T16 FEE DUE"),
    t16FeeRcv: idx("T16 FEE $ REC'D"),
    t16Pending: idx("T16 PENDING"),
    t16Date: idx("DATE T16 FEE REC'D"),
    t2Retro: idx("T2 RETRO"),
    t2FeeDue: idx("T2 FEE DUE"),
    t2FeeRcv: idx("T2 FEE $ REC'D"),
    t2Pending: idx("T2 PENDING"),
    t2Date: idx("DATE T2 FEE REC'D"),
    auxRetro: idx("RETRO AUX"),
    auxFeeDue: idx("AUX FEE DUE"),
    auxFeeRcv: idx("AUX FEE $ REC'D"),
    auxPending: idx("AUX PENDING"),
    auxDate: idx("DATE AUX FEE REC'D"),
    notes: idx("COLLECTION NOTES"),
    dateAssigned: idx("DATE ASSIGNED TO AGENT"),
  };

  // exceljs columns are 1-indexed; our idx() values are 0-indexed.
  const col = (zeroIdx: number) => zeroIdx + 1;

  const rows: ParsedCaseRow[] = [];
  const warnings: ParseResult["warnings"] = [];
  const seenIds = new Set<number>();
  let synthetic = SYNTHETIC_ID_BASE;

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const getCell = (zeroIdx: number): ExcelJS.Cell | null =>
      zeroIdx < 0 ? null : row.getCell(col(zeroIdx));

    const caseLinkCell = getCell(C.caseLink);
    const linkText = cellText(caseLinkCell).trim();
    if (!linkText) return; // skip blank rows

    const link = cellHyperlink(caseLinkCell);
    const myCaseMatch = link?.match(MYCASE_URL_RE);
    const myCaseId = myCaseMatch ? Number(myCaseMatch[1]) : null;

    let clientId: number;
    if (myCaseId && !seenIds.has(myCaseId)) {
      clientId = myCaseId;
    } else {
      while (seenIds.has(synthetic)) synthetic++;
      clientId = synthetic++;
      if (myCaseId)
        warnings.push({
          row: rowNumber,
          message: `Duplicate MyCase id ${myCaseId} — using synthetic ${clientId}`,
        });
    }
    seenIds.add(clientId);

    const { firstName, lastName, aljFirstName, aljLastName } =
      parseCaseLink(linkText);
    const ct = mapClaimType(cellText(getCell(C.claimType)));

    const winSheetCell = getCell(C.winSheetLink);
    const winSheetUrl = cellHyperlink(winSheetCell);
    const winSheetText = cellText(winSheetCell).trim() || null;

    rows.push({
      clientId,
      externalId: link,
      caseLink: linkText,
      firstName: firstName || "Unknown",
      lastName: lastName || "Unknown",
      approvalDate: dateOnly(cellRaw(getCell(C.approvalDate))),
      levelWon: mapLevelWon(cellText(getCell(C.caseLevel))),
      claimType: ct.claimType,
      claimTypeLabel: ct.claimTypeLabel,
      aljFirstName,
      aljLastName,

      assignedTo: cellText(getCell(C.assignedTo)).trim() || null,
      winSheetStatus: mapWinSheetStatus(cellText(getCell(C.winSheetStatus))),
      winSheetLink: winSheetUrl ?? winSheetText,
      winSheetLinkText: winSheetText,
      caseStatus: cellText(getCell(C.caseStatus)).trim() || null,
      feesConfirmation: cellText(getCell(C.feesConfirmation)).trim() || null,
      dateAssignedToAgent: dateOnly(cellRaw(getCell(C.dateAssigned))),
      approvedBy: cellText(getCell(C.approvedBy)).trim() || null,

      t16Retro: num(cellRaw(getCell(C.t16Retro))),
      t16FeeDue: num(cellRaw(getCell(C.t16FeeDue))),
      t16FeeReceived: num(cellRaw(getCell(C.t16FeeRcv))),
      t16Pending: num(cellRaw(getCell(C.t16Pending))),
      t16FeeReceivedDate: dateOnly(cellRaw(getCell(C.t16Date))),

      t2Retro: num(cellRaw(getCell(C.t2Retro))),
      t2FeeDue: num(cellRaw(getCell(C.t2FeeDue))),
      t2FeeReceived: num(cellRaw(getCell(C.t2FeeRcv))),
      t2Pending: num(cellRaw(getCell(C.t2Pending))),
      t2FeeReceivedDate: dateOnly(cellRaw(getCell(C.t2Date))),

      auxRetro: num(cellRaw(getCell(C.auxRetro))),
      auxFeeDue: num(cellRaw(getCell(C.auxFeeDue))),
      auxFeeReceived: num(cellRaw(getCell(C.auxFeeRcv))),
      auxPending: num(cellRaw(getCell(C.auxPending))),
      auxFeeReceivedDate: dateOnly(cellRaw(getCell(C.auxDate))),

      daysAfterApproval: null,
      approvalCategory: null,
      feesStatus: null,
      weekAssignedToAgent: null,
      monthAssignedToAgent: null,
      t2Decision: "unknown",
      t16Decision: "unknown",
      notes: cellText(getCell(C.notes)).trim() || null,
    });
  });

  return { rows, warnings };
};
