import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import type { SheetRow } from "@/lib/import/sheets-mapper";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmt = (v: string | null | undefined): string | null =>
  v ?? null;

const fmtNum = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
};

const buildSheetRow = (
  row: Awaited<ReturnType<typeof queryAllCases>>[number],
  latestNote: string | null,
  isNewToSheet: boolean,
) => ({
  "CASE LINK": fmt(row.caseLink) ?? "",
  "ASSIGNED TO": fmt(row.assignedTo),
  "CASE LEVEL": fmt(row.levelWon),
  "CLAIM TYPE": row.claimTypeLabel === "T2_T16" ? "CONC" : fmt(row.claimTypeLabel),
  "APPROVAL DATE": fmt(row.approvalDate),
  "WIN SHEET STATUS": fmt(row.winSheetStatus) ?? "not_started",
  // Only write WIN SHEET LINK for rows being appended — existing rows already
  // have a hyperlinked cell in the sheet that we must not overwrite with plain text.
  ...(isNewToSheet && row.winSheetLink
    ? { "WIN SHEET LINK": fmt(row.winSheetLink) }
    : {}),
  "FEES CONFIRMATION": fmt(row.feesConfirmation),
  "CASE STATUS": fmt(row.caseStatus),
  "APPROVED BY (OK TO CLOSE)": fmt(row.approvedBy),
  "T16 RETRO": fmtNum(row.t16Retro),
  "T16 FEE DUE": fmtNum(row.t16FeeDue),
  "T16 FEE $ REC'D": fmtNum(row.t16FeeReceived),
  "T16 Pending": fmtNum(row.t16Pending),
  // Trailing space is intentional — the actual sheet column header has a trailing space.
  "DATE T16 FEE REC'D ": fmt(row.t16FeeReceivedDate),
  "T2 RETRO": fmtNum(row.t2Retro),
  "T2 FEE DUE": fmtNum(row.t2FeeDue),
  "T2 FEE $ REC'D": fmtNum(row.t2FeeReceived),
  "T2 Pending": fmtNum(row.t2Pending),
  "DATE T2 FEE REC'D": fmt(row.t2FeeReceivedDate),
  "RETRO AUX": fmtNum(row.auxRetro),
  "AUX FEE DUE": fmtNum(row.auxFeeDue),
  // Trailing space is intentional — the actual sheet column header has a trailing space.
  "AUX FEE $ REC'D ": fmtNum(row.auxFeeReceived),
  "AUX PENDING": fmtNum(row.auxPending),
  "DATE AUX FEE REC'D": fmt(row.auxFeeReceivedDate),
  "COLLECTION NOTES": latestNote,
  "DATE ASSIGNED TO AGENT": fmt(row.dateAssignedToAgent),
});

async function queryAllCases() {
  return db
    .select({
      clientId: cases.clientId,
      caseLink: cases.caseLink,
      approvalDate: cases.approvalDate,
      levelWon: cases.levelWon,
      claimTypeLabel: cases.claimTypeLabel,
      assignedTo: feeRecords.assignedTo,
      winSheetStatus: feeRecords.winSheetStatus,
      winSheetLink: feeRecords.winSheetLink,
      caseStatus: feeRecords.caseStatus,
      feesConfirmation: feeRecords.feesConfirmation,
      approvedBy: feeRecords.approvedBy,
      dateAssignedToAgent: feeRecords.dateAssignedToAgent,
      t16Retro: feeRecords.t16Retro,
      t16FeeDue: feeRecords.t16FeeDue,
      t16FeeReceived: feeRecords.t16FeeReceived,
      t16Pending: feeRecords.t16Pending,
      t16FeeReceivedDate: feeRecords.t16FeeReceivedDate,
      t2Retro: feeRecords.t2Retro,
      t2FeeDue: feeRecords.t2FeeDue,
      t2FeeReceived: feeRecords.t2FeeReceived,
      t2Pending: feeRecords.t2Pending,
      t2FeeReceivedDate: feeRecords.t2FeeReceivedDate,
      auxRetro: feeRecords.auxRetro,
      auxFeeDue: feeRecords.auxFeeDue,
      auxFeeReceived: feeRecords.auxFeeReceived,
      auxPending: feeRecords.auxPending,
      auxFeeReceivedDate: feeRecords.auxFeeReceivedDate,
    })
    .from(cases)
    .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
    .orderBy(cases.approvalDate);
}

async function queryLatestNotes(clientIds: number[]): Promise<Map<number, string>> {
  if (clientIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([activityLog.caseId], {
      caseId: activityLog.caseId,
      message: activityLog.message,
    })
    .from(activityLog)
    .where(inArray(activityLog.caseId, clientIds))
    .orderBy(activityLog.caseId, desc(activityLog.createdAt));

  const map = new Map<number, string>();
  for (const r of rows) map.set(r.caseId, r.message);
  return map;
}

// Fetch existing CASE LINK values from the sheet via the sync webhook.
// Returns a Set of trimmed CASE LINK strings already present in the sheet.
// On failure, returns an empty set — rows are treated as new (WIN SHEET LINK included).
async function fetchExistingSheetCaseLinks(): Promise<Set<string>> {
  const webhookUrl = process.env.SHEETS_SYNC_WEBHOOK_URL;
  if (!webhookUrl) return new Set();

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "manual" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return new Set();
    const rows = (await res.json()) as SheetRow[];
    if (!Array.isArray(rows)) return new Set();
    return new Set(
      rows.map((r) => String(r["CASE LINK"] ?? "").trim()).filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

// POST /api/sheets/push
//   Query:
//     mode=preview  → query DB, return count + first 10 rows (no writes, no n8n call)
//     mode=push     → fetch sheet to identify new rows, then POST to n8n webhook
export const POST = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode") ?? "preview";
    if (modeParam !== "preview" && modeParam !== "push") {
      return NextResponse.json({ error: `Invalid mode: ${modeParam}` }, { status: 400 });
    }
    const mode = modeParam;

    const allRows = await queryAllCases();
    const clientIds = allRows.map((r) => r.clientId);

    if (mode === "preview") {
      const notesMap = await queryLatestNotes(clientIds);
      const sheetRows = allRows.map((r) =>
        buildSheetRow(r, notesMap.get(r.clientId) ?? null, false),
      );
      return NextResponse.json({
        total: sheetRows.length,
        sample: sheetRows.slice(0, 10),
      });
    }

    // push mode — run notes query and sheet-link fetch concurrently
    const webhookUrl = process.env.SHEETS_PUSH_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "SHEETS_PUSH_WEBHOOK_URL is not configured" },
        { status: 503 },
      );
    }

    const [notesMap, existingCaseLinks] = await Promise.all([
      queryLatestNotes(clientIds),
      fetchExistingSheetCaseLinks(),
    ]);

    const sheetRows = allRows.map((r) => {
      const caseLink = String(r.caseLink ?? "").trim();
      const isNewToSheet = !existingCaseLinks.has(caseLink);
      return buildSheetRow(r, notesMap.get(r.clientId) ?? null, isNewToSheet);
    });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: sheetRows }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      throw new Error(
        `Push webhook failed (${res.status}): ${await res.text()}`,
      );
    }

    let pushed = sheetRows.length;
    try {
      const result = (await res.json()) as { pushed?: number };
      if (result.pushed != null) pushed = result.pushed;
    } catch { /* non-JSON body — fall back to row count */ }
    return NextResponse.json({ pushed });
  } catch (error) {
    console.error("POST /api/sheets/push error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
