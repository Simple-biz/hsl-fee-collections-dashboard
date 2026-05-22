import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmt = (v: string | null | undefined): string | null =>
  v ?? null;

const fmtNum = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
};

const fmtHyperlink = (url: string | null | undefined, label = "Win Sheet"): string | null => {
  if (!url) return null;
  if (!url.startsWith("http")) return fmt(url);
  return `=HYPERLINK("${url.replace(/"/g, '""')}", "${label}")`;
};

const daysSince = (dateStr: string | null | undefined): number | null => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
};

const isoWeek = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const thu = new Date(d);
  thu.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const year = thu.getFullYear();
  const firstThu = new Date(year, 0, 1 + ((4 - new Date(year, 0, 1).getDay() + 7) % 7));
  const week = 1 + Math.round((thu.getTime() - firstThu.getTime()) / 604_800_000);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

const yearMonth = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const buildSheetRow = (
  row: Awaited<ReturnType<typeof queryAllCases>>[number],
  latestNote: string | null,
) => {
  const caseLinkValue = row.externalId
    ? fmtHyperlink(row.externalId, row.caseLink ?? "") ?? (fmt(row.caseLink) ?? "")
    : (fmt(row.caseLink) ?? "");

  const full: Record<string, string> = {
    "CLIENT_ID": String(row.clientId),
    "CASE LINK": caseLinkValue,
    "WIN SHEET STATUS": fmt(row.winSheetStatus) ?? "not_started",
  };

  // Formula columns: n8n returns these empty for formula cells; compute from source data.
  const computedDays = row.daysAfterApproval ?? daysSince(row.approvalDate);
  const computedCategory = computedDays != null ? (computedDays > 60 ? ">60" : "≤60") : null;
  const computedWeek = row.weekAssignedToAgent ?? isoWeek(row.dateAssignedToAgent);
  const computedMonth = row.monthAssignedToAgent ?? yearMonth(row.dateAssignedToAgent);

  const optional: Record<string, string | null> = {
    "WIN SHEET LINK": fmtHyperlink(row.winSheetLink, row.winSheetLinkText ?? "Win Sheet"),
    "ASSIGNED TO": fmt(row.assignedTo),
    "CASE LEVEL": fmt(row.levelWon),
    "CLAIM TYPE": row.claimTypeLabel === "T2_T16" ? "CONC" : fmt(row.claimTypeLabel),
    "APPROVAL DATE": fmt(row.approvalDate),
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
    "TOTAL RETRO DUE": fmtNum(row.totalRetroDue),
    "TOTAL FEES EXPECTED": fmtNum(row.totalFeesExpected),
    "TOTAL FEES PAID": fmtNum(row.totalFeesPaid),
    "COLLECTION NOTES": latestNote,
    "DAYS AFTER APPROVAL": computedDays != null ? String(computedDays) : null,
    "APPROVAL CATEGORY": computedCategory,
    "FEES STATUS": fmt(row.feesStatus),
    "DATE ASSIGNED TO AGENT": fmt(row.dateAssignedToAgent),
    "WEEK ASSIGNED TO AGENT": computedWeek,
    "MONTH ASSIGNED TO AGENT": computedMonth,
  };

  // Strip null fields — sending null to a dropdown-validated column causes
  // Google Sheets to reject the entire row write.
  for (const [k, v] of Object.entries(optional)) {
    if (v !== null) full[k] = v;
  }

  return full;
};

async function queryAllCases() {
  return db
    .select({
      clientId: cases.clientId,
      externalId: cases.externalId,
      caseLink: cases.caseLink,
      approvalDate: cases.approvalDate,
      levelWon: cases.levelWon,
      claimTypeLabel: cases.claimTypeLabel,
      assignedTo: feeRecords.assignedTo,
      winSheetStatus: feeRecords.winSheetStatus,
      winSheetLink: feeRecords.winSheetLink,
      winSheetLinkText: feeRecords.winSheetLinkText,
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
      totalRetroDue: feeRecords.totalRetroDue,
      totalFeesExpected: feeRecords.totalFeesExpected,
      totalFeesPaid: feeRecords.totalFeesPaid,
      daysAfterApproval: feeRecords.daysAfterApproval,
      approvalCategory: feeRecords.approvalCategory,
      feesStatus: feeRecords.feesStatus,
      weekAssignedToAgent: feeRecords.weekAssignedToAgent,
      monthAssignedToAgent: feeRecords.monthAssignedToAgent,
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
        buildSheetRow(r, notesMap.get(r.clientId) ?? null),
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

    const notesMap = await queryLatestNotes(clientIds);

    const sheetRows = allRows.map((r) =>
      buildSheetRow(r, notesMap.get(r.clientId) ?? null),
    );

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
