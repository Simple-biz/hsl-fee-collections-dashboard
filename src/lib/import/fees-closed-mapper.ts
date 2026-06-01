import type { SheetRow } from "./sheets-mapper";

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

export type ParsedFeesClosedRow = {
  caseName: string;
  closedDate: string | null;
  assignedTo: string | null;
  caseLevel: string | null;
  claimType: string | null;
  approvalDate: string | null;
  winSheetStatus: string | null;
  winSheetLink: string | null;
  feesConfirmation: string | null;
  caseStatus: string | null;
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
  totalRetroDue: string;
  totalFeesExpected: string;
  totalFeesPaid: string;
  recentStatusUpdates: string | null;
};

export const mapFeesClosedRows = (
  rows: SheetRow[],
): { rows: ParsedFeesClosedRow[]; warnings: { row: number; message: string }[] } => {
  const out: ParsedFeesClosedRow[] = [];
  const warnings: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const caseName = String(r["CASE NAME"] ?? "").trim();
    if (!caseName) continue;

    const winSheetLink = r["WIN SHEET LINK_url"]
      ? String(r["WIN SHEET LINK_url"]).trim()
      : r["WIN SHEET LINK"]
        ? String(r["WIN SHEET LINK"]).trim()
        : null;

    out.push({
      caseName,
      closedDate: dateOnly(r["date"]),
      assignedTo: r["ASSIGNED TO"] ? String(r["ASSIGNED TO"]).trim() : null,
      caseLevel: r["CASE LEVEL"] ? String(r["CASE LEVEL"]).trim() : null,
      claimType: r["CLAIM TYPE"] ? String(r["CLAIM TYPE"]).trim() : null,
      approvalDate: dateOnly(r["APPROVAL DATE"]),
      winSheetStatus: r["WIN SHEET"] ? String(r["WIN SHEET"]).trim() : null,
      winSheetLink,
      feesConfirmation: r["FEES CONFIRMATION"] ? String(r["FEES CONFIRMATION"]).trim().slice(0, 50) : null,
      caseStatus: r["CASE STATUS"] ? String(r["CASE STATUS"]).trim() : null,
      approvedBy: r["APPROVED BY (OK TO CLOSE)"] ? String(r["APPROVED BY (OK TO CLOSE)"]).trim() : null,
      t16Retro: num(r["T16 RETRO"]),
      t16FeeDue: num(r["T16 FEE DUE"]),
      t16FeeReceived: num(r["T16 FEE $ REC'D"]),
      t16Pending: num(r["T16 Pending"]),
      t16FeeReceivedDate: dateOnly(r["DATE T16 FEE REC'D"]),
      t2Retro: num(r["T2 RETRO"]),
      t2FeeDue: num(r["T2 FEE DUE"]),
      t2FeeReceived: num(r["T2 FEE $ REC'D"]),
      t2Pending: num(r["T2 Pending"]),
      t2FeeReceivedDate: dateOnly(r["DATE T2 FEE REC'D"]),
      auxRetro: num(r["RETRO AUX"]),
      auxFeeDue: num(r["AUX FEE DUE"]),
      auxFeeReceived: num(r["AUX FEE $ REC'D"]),
      auxPending: num(r["AUX PENDING"]),
      auxFeeReceivedDate: dateOnly(r["DATE AUX FEE REC'D"]),
      totalRetroDue: num(r["TOTAL RETRO DUE"]),
      totalFeesExpected: num(r["TOTAL FEES EXPECTED"]),
      totalFeesPaid: num(r["TOTAL FEES PAID"]),
      recentStatusUpdates: r["RECENT STATUS UPDATES"]
        ? String(r["RECENT STATUS UPDATES"]).trim()
        : null,
    });
  }

  return { rows: out, warnings };
};
