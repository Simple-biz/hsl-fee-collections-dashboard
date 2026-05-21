import type { ParsedCaseRow } from "./xlsx-mapper";

export type SheetRow = Record<string, string | number | null | undefined>;

const SYNTHETIC_ID_BASE = 900_000_000;
const MYCASE_URL_RE = /mycase\.com\/court_cases\/(\d+)/i;

const num = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "0";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, $]/g, ""));
  return Number.isFinite(n) ? String(n) : "0";
};

const dateOnly = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m2) {
    const yy = m2[3].length === 2 ? `20${m2[3]}` : m2[3];
    return `${yy}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  }
  return null;
};

const parseCaseLink = (link: string) => {
  let s = link.trim();
  s = s.replace(/^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\s+/, "");
  const parts = s.split(/\s+v(?:s|\.)\s+/i);
  const left = parts[0] || "";
  const right = parts[1] || "";
  const leftClean = left.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const [lastRaw, firstRaw] = leftClean.split(/,\s*/);
  const lastName = (lastRaw || leftClean).trim();
  const firstName = (firstRaw || "").trim();
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

const mapClaimType = (raw: unknown) => {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!s)
    return {
      claimType: [] as string[],
      claimTypeLabel: null as "T2" | "T16" | "T2_T16" | null,
    };
  if (s === "CONC" || s === "T2/T16" || s === "T2 T16" || s === "T2_T16")
    return { claimType: ["T2", "T16"], claimTypeLabel: "T2_T16" as const };
  if (s === "T16") return { claimType: ["T16"], claimTypeLabel: "T16" as const };
  if (s === "T2") return { claimType: ["T2"], claimTypeLabel: "T2" as const };
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

export const mapSheetRows = (
  rows: SheetRow[],
): { rows: ParsedCaseRow[]; warnings: { row: number; message: string }[] } => {
  const out: ParsedCaseRow[] = [];
  const warnings: { row: number; message: string }[] = [];
  const seenIds = new Set<number>();
  let synthetic = SYNTHETIC_ID_BASE;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const linkText = String(r["CASE LINK"] ?? "").trim();
    if (!linkText) continue;

    const url = r["CASE LINK_url"] ? String(r["CASE LINK_url"]).trim() : null;
    const myCaseMatch = url?.match(MYCASE_URL_RE);
    const myCaseId = myCaseMatch ? Number(myCaseMatch[1]) : null;

    let clientId: number;
    if (myCaseId && !seenIds.has(myCaseId)) {
      clientId = myCaseId;
    } else {
      while (seenIds.has(synthetic)) synthetic++;
      clientId = synthetic++;
      if (myCaseId)
        warnings.push({
          row: i + 2,
          message: `Duplicate MyCase id ${myCaseId} — using synthetic ${clientId}`,
        });
    }
    seenIds.add(clientId);

    const { firstName, lastName, aljFirstName, aljLastName } = parseCaseLink(linkText);
    const ct = mapClaimType(r["CLAIM TYPE"]);
    const winSheetLink = r["WIN SHEET LINK_url"]
      ? String(r["WIN SHEET LINK_url"]).trim()
      : r["WIN SHEET LINK"]
        ? String(r["WIN SHEET LINK"]).trim()
        : null;
    const winSheetLinkText = r["WIN SHEET LINK"]
      ? String(r["WIN SHEET LINK"]).trim()
      : null;

    out.push({
      clientId,
      externalId: url,
      caseLink: linkText,
      firstName: firstName || "Unknown",
      lastName: lastName || "Unknown",
      approvalDate: dateOnly(r["APPROVAL DATE"]),
      levelWon: mapLevelWon(r["CASE LEVEL"]),
      claimType: ct.claimType,
      claimTypeLabel: ct.claimTypeLabel,
      aljFirstName,
      aljLastName,
      assignedTo: r["ASSIGNED TO"] ? String(r["ASSIGNED TO"]).trim() : null,
      winSheetStatus: mapWinSheetStatus(r["WIN SHEET STATUS"]),
      winSheetLink,
      winSheetLinkText,
      caseStatus: r["CASE STATUS"] ? String(r["CASE STATUS"]).trim() : null,
      feesConfirmation: r["FEES CONFIRMATION"]
        ? String(r["FEES CONFIRMATION"]).trim()
        : null,
      dateAssignedToAgent: dateOnly(r["DATE ASSIGNED TO AGENT"]),
      approvedBy: r["APPROVED BY (OK TO CLOSE)"]
        ? String(r["APPROVED BY (OK TO CLOSE)"]).trim()
        : null,
      t16Retro: num(r["T16 RETRO"]),
      t16FeeDue: num(r["T16 FEE DUE"]),
      t16FeeReceived: num(r["T16 FEE $ REC'D"]),
      t16Pending: num(r["T16 PENDING"]),
      t16FeeReceivedDate: dateOnly(r["DATE T16 FEE REC'D"]),
      t2Retro: num(r["T2 RETRO"]),
      t2FeeDue: num(r["T2 FEE DUE"]),
      t2FeeReceived: num(r["T2 FEE $ REC'D"]),
      t2Pending: num(r["T2 PENDING"]),
      t2FeeReceivedDate: dateOnly(r["DATE T2 FEE REC'D"]),
      auxRetro: num(r["RETRO AUX"]),
      auxFeeDue: num(r["AUX FEE DUE"]),
      auxFeeReceived: num(r["AUX FEE $ REC'D"]),
      auxPending: num(r["AUX PENDING"]),
      auxFeeReceivedDate: dateOnly(r["DATE AUX FEE REC'D"]),
      notes: r["COLLECTION NOTES"] ? String(r["COLLECTION NOTES"]).trim() : null,
    });
  }

  return { rows: out, warnings };
};

export const MOCK_SHEET_ROWS: SheetRow[] = [
  {
    "CASE LINK": "2024.03.15 Johnson, Emily v. ALJ Smith",
    "CASE LINK_url": "https://app.mycase.com/court_cases/111001",
    "ASSIGNED TO": "Maria Santos",
    "CASE LEVEL": "HEARING",
    "CLAIM TYPE": "T2",
    "APPROVAL DATE": "2024-03-15",
    "WIN SHEET STATUS": "in_progress",
    "WIN SHEET LINK": "Fee Sheet",
    "WIN SHEET LINK_url": null,
    "FEES CONFIRMATION": null,
    "CASE STATUS": "Active",
    "APPROVED BY (OK TO CLOSE)": null,
    "T16 RETRO": 0,
    "T16 FEE DUE": 0,
    "T16 FEE $ REC'D": 0,
    "T16 PENDING": 0,
    "DATE T16 FEE REC'D": null,
    "T2 RETRO": 48000,
    "T2 FEE DUE": 6000,
    "T2 FEE $ REC'D": 3000,
    "T2 PENDING": 3000,
    "DATE T2 FEE REC'D": null,
    "RETRO AUX": 0,
    "AUX FEE DUE": 0,
    "AUX FEE $ REC'D": 0,
    "AUX PENDING": 0,
    "DATE AUX FEE REC'D": null,
    "COLLECTION NOTES": null,
    "DATE ASSIGNED TO AGENT": "2024-03-20",
  },
  {
    "CASE LINK": "2024.01.10 Williams, Robert v. ALJ Jones",
    "CASE LINK_url": "https://app.mycase.com/court_cases/111002",
    "ASSIGNED TO": "Carlos Rivera",
    "CASE LEVEL": "HEARING",
    "CLAIM TYPE": "T16",
    "APPROVAL DATE": "2024-01-10",
    "WIN SHEET STATUS": "paid_in_full",
    "WIN SHEET LINK": "Fee Sheet",
    "WIN SHEET LINK_url": null,
    "FEES CONFIRMATION": "CONFIRMED",
    "CASE STATUS": "Closed",
    "APPROVED BY (OK TO CLOSE)": "Manager",
    "T16 RETRO": 24000,
    "T16 FEE DUE": 6000,
    "T16 FEE $ REC'D": 6000,
    "T16 PENDING": 0,
    "DATE T16 FEE REC'D": "2024-02-28",
    "T2 RETRO": 0,
    "T2 FEE DUE": 0,
    "T2 FEE $ REC'D": 0,
    "T2 PENDING": 0,
    "DATE T2 FEE REC'D": null,
    "RETRO AUX": 0,
    "AUX FEE DUE": 0,
    "AUX FEE $ REC'D": 0,
    "AUX PENDING": 0,
    "DATE AUX FEE REC'D": null,
    "COLLECTION NOTES": "Paid in full on 2/28",
    "DATE ASSIGNED TO AGENT": "2024-01-15",
  },
  {
    "CASE LINK": "2024.05.22 Garcia, Maria v. ALJ Brown",
    "CASE LINK_url": "https://app.mycase.com/court_cases/111003",
    "ASSIGNED TO": null,
    "CASE LEVEL": "RECON",
    "CLAIM TYPE": "T2_T16",
    "APPROVAL DATE": "2024-05-22",
    "WIN SHEET STATUS": "not_started",
    "WIN SHEET LINK": null,
    "WIN SHEET LINK_url": null,
    "FEES CONFIRMATION": null,
    "CASE STATUS": "New",
    "APPROVED BY (OK TO CLOSE)": null,
    "T16 RETRO": 36000,
    "T16 FEE DUE": 4500,
    "T16 FEE $ REC'D": 0,
    "T16 PENDING": 4500,
    "DATE T16 FEE REC'D": null,
    "T2 RETRO": 18000,
    "T2 FEE DUE": 2250,
    "T2 FEE $ REC'D": 0,
    "T2 PENDING": 2250,
    "DATE T2 FEE REC'D": null,
    "RETRO AUX": 0,
    "AUX FEE DUE": 0,
    "AUX FEE $ REC'D": 0,
    "AUX PENDING": 0,
    "DATE AUX FEE REC'D": null,
    "COLLECTION NOTES": null,
    "DATE ASSIGNED TO AGENT": null,
  },
  {
    "CASE LINK": "2024.07.08 Martinez, Luis v. ALJ Davis",
    "CASE LINK_url": "https://app.mycase.com/court_cases/111004",
    "ASSIGNED TO": "Maria Santos",
    "CASE LEVEL": "HEARING",
    "CLAIM TYPE": "T2",
    "APPROVAL DATE": "2024-07-08",
    "WIN SHEET STATUS": "pending_payment",
    "WIN SHEET LINK": "Fee Sheet",
    "WIN SHEET LINK_url": null,
    "FEES CONFIRMATION": null,
    "CASE STATUS": "Pending",
    "APPROVED BY (OK TO CLOSE)": null,
    "T16 RETRO": 0,
    "T16 FEE DUE": 0,
    "T16 FEE $ REC'D": 0,
    "T16 PENDING": 0,
    "DATE T16 FEE REC'D": null,
    "T2 RETRO": 62000,
    "T2 FEE DUE": 7750,
    "T2 FEE $ REC'D": 0,
    "T2 PENDING": 7750,
    "DATE T2 FEE REC'D": null,
    "RETRO AUX": 8000,
    "AUX FEE DUE": 1000,
    "AUX FEE $ REC'D": 0,
    "AUX PENDING": 1000,
    "DATE AUX FEE REC'D": null,
    "COLLECTION NOTES": "Awaiting SSA payment",
    "DATE ASSIGNED TO AGENT": "2024-07-15",
  },
];
