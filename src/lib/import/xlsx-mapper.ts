import * as XLSX from "xlsx";

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

// Parse "YYYY.MM.DD Lastname, Firstname v. ALJ NAME" → names
const parseCaseLink = (
  link: string,
): {
  firstName: string;
  lastName: string;
  aljFirstName: string | null;
  aljLastName: string | null;
} => {
  let s = link.trim();
  // Strip leading date "YYYY.MM.DD "
  s = s.replace(/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s+/, "");
  // Split on " v. " / " vs " / " V. " (case-insensitive)
  const parts = s.split(/\s+v(?:s|\.)\s+/i);
  const left = parts[0] || "";
  const right = parts[1] || "";

  // Left: "Lastname, Firstname" — strip trailing parens like " (SSI CASE)"
  const leftClean = left.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const [lastRaw, firstRaw] = leftClean.split(/,\s*/);
  const lastName = (lastRaw || leftClean).trim();
  const firstName = (firstRaw || "").trim();

  // Right: "ALJ FIRST LAST" — strip "ALJ " prefix, then split into first/last
  let aljFirstName: string | null = null;
  let aljLastName: string | null = null;
  const aljClean = right
    .replace(/^ALJ\s+/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
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
  if (s.includes("started")) return "started";
  if (s === "not started" || s === "not_started") return "not_started";
  if (s === "in progress" || s === "in_progress") return "in_progress";
  if (s === "pending payment") return "pending_payment";
  if (s === "partially paid") return "partially_paid";
  if (s === "paid in full") return "paid_in_full";
  if (s === "closed") return "closed";
  return "started";
};

export const parseWorksheet = (buffer: Buffer): ParseResult => {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.includes("MASTER LIST")
    ? "MASTER LIST"
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], warnings: [{ row: 0, message: "No sheet found" }] };

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
  if (aoa.length < 2) return { rows: [], warnings: [] };

  const header = (aoa[0] as string[]).map((h) =>
    String(h ?? "")
      .trim()
      .toUpperCase(),
  );
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

  // Pull hyperlinks for CASE LINK and WIN SHEET LINK columns
  const caseLinkUrls = new Map<number, string>();
  const winSheetLinkUrls = new Map<number, string>();
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    if (C.caseLink >= 0) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: C.caseLink })];
      if (cell?.l?.Target) caseLinkUrls.set(r, cell.l.Target);
    }
    if (C.winSheetLink >= 0) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: C.winSheetLink })];
      if (cell?.l?.Target) winSheetLinkUrls.set(r, cell.l.Target);
    }
  }

  const rows: ParsedCaseRow[] = [];
  const warnings: ParseResult["warnings"] = [];
  const seenIds = new Set<number>();
  let synthetic = SYNTHETIC_ID_BASE;

  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r] as unknown[];
    const linkText = String(row[C.caseLink] ?? "").trim();
    if (!linkText) continue; // skip blank rows

    const link = caseLinkUrls.get(r) ?? null;
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
          row: r + 1,
          message: `Duplicate MyCase id ${myCaseId} — using synthetic ${clientId}`,
        });
    }
    seenIds.add(clientId);

    const { firstName, lastName, aljFirstName, aljLastName } =
      parseCaseLink(linkText);
    const ct = mapClaimType(row[C.claimType]);

    rows.push({
      clientId,
      externalId: link, // store the MyCase URL for traceability
      caseLink: linkText,
      firstName: firstName || "Unknown",
      lastName: lastName || "Unknown",
      approvalDate: dateOnly(row[C.approvalDate]),
      levelWon: mapLevelWon(row[C.caseLevel]),
      claimType: ct.claimType,
      claimTypeLabel: ct.claimTypeLabel,
      aljFirstName,
      aljLastName,

      assignedTo: row[C.assignedTo] ? String(row[C.assignedTo]).trim() : null,
      winSheetStatus: mapWinSheetStatus(row[C.winSheetStatus]),
      winSheetLink:
        winSheetLinkUrls.get(r) ??
        (row[C.winSheetLink] ? String(row[C.winSheetLink]).trim() : null),
      winSheetLinkText: row[C.winSheetLink]
        ? String(row[C.winSheetLink]).trim()
        : null,
      caseStatus: row[C.caseStatus] ? String(row[C.caseStatus]).trim() : null,
      feesConfirmation: row[C.feesConfirmation]
        ? String(row[C.feesConfirmation]).trim()
        : null,
      dateAssignedToAgent: dateOnly(row[C.dateAssigned]),
      approvedBy: row[C.approvedBy] ? String(row[C.approvedBy]).trim() : null,

      t16Retro: num(row[C.t16Retro]),
      t16FeeDue: num(row[C.t16FeeDue]),
      t16FeeReceived: num(row[C.t16FeeRcv]),
      t16Pending: num(row[C.t16Pending]),
      t16FeeReceivedDate: dateOnly(row[C.t16Date]),

      t2Retro: num(row[C.t2Retro]),
      t2FeeDue: num(row[C.t2FeeDue]),
      t2FeeReceived: num(row[C.t2FeeRcv]),
      t2Pending: num(row[C.t2Pending]),
      t2FeeReceivedDate: dateOnly(row[C.t2Date]),

      auxRetro: num(row[C.auxRetro]),
      auxFeeDue: num(row[C.auxFeeDue]),
      auxFeeReceived: num(row[C.auxFeeRcv]),
      auxPending: num(row[C.auxPending]),
      auxFeeReceivedDate: dateOnly(row[C.auxDate]),

      notes: row[C.notes] ? String(row[C.notes]).trim() : null,
    });
  }

  return { rows, warnings };
};
