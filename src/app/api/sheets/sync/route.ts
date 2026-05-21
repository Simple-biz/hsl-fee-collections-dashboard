import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import {
  mapSheetRows,
  MOCK_SHEET_ROWS,
  type SheetRow,
} from "@/lib/import/sheets-mapper";
import type { ParsedCaseRow } from "@/lib/import/xlsx-mapper";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK = 500;

const chunked = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchFromSheets = async (): Promise<{
  rows: SheetRow[];
  usingMock: boolean;
}> => {
  const webhookUrl = process.env.SHEETS_SYNC_WEBHOOK_URL;
  if (!webhookUrl) return { rows: MOCK_SHEET_ROWS, usingMock: true };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trigger: "manual" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok)
    throw new Error(
      `Sheets sync webhook failed (${res.status}): ${await res.text()}`,
    );
  const rows = (await res.json()) as SheetRow[];
  if (!Array.isArray(rows))
    throw new Error("Sheets sync webhook returned invalid response shape");
  return { rows, usingMock: false };
};

const toCaseInsert = (r: ParsedCaseRow) => ({
  clientId: r.clientId,
  externalId: r.externalId,
  caseLink: r.caseLink,
  firstName: r.firstName,
  lastName: r.lastName,
  approvalDate: r.approvalDate,
  levelWon: r.levelWon,
  claimType: r.claimType,
  claimTypeLabel: r.claimTypeLabel,
  aljFirstName: r.aljFirstName,
  aljLastName: r.aljLastName,
});

const toFeeInsert = (r: ParsedCaseRow) => ({
  caseId: r.clientId,
  assignedTo: r.assignedTo,
  winSheetStatus: r.winSheetStatus,
  winSheetLink: r.winSheetLink,
  winSheetLinkText: r.winSheetLinkText,
  caseStatus: r.caseStatus,
  feesConfirmation: r.feesConfirmation,
  dateAssignedToAgent: r.dateAssignedToAgent,
  approvedBy: r.approvedBy,
  t16Retro: r.t16Retro,
  t16FeeDue: r.t16FeeDue,
  t16FeeReceived: r.t16FeeReceived,
  t16Pending: r.t16Pending,
  t16FeeReceivedDate: r.t16FeeReceivedDate,
  t2Retro: r.t2Retro,
  t2FeeDue: r.t2FeeDue,
  t2FeeReceived: r.t2FeeReceived,
  t2Pending: r.t2Pending,
  t2FeeReceivedDate: r.t2FeeReceivedDate,
  auxRetro: r.auxRetro,
  auxFeeDue: r.auxFeeDue,
  auxFeeReceived: r.auxFeeReceived,
  auxPending: r.auxPending,
  auxFeeReceivedDate: r.auxFeeReceivedDate,
  daysAfterApproval: r.daysAfterApproval,
  approvalCategory: r.approvalCategory,
  feesStatus: r.feesStatus,
  weekAssignedToAgent: r.weekAssignedToAgent,
  monthAssignedToAgent: r.monthAssignedToAgent,
});

const toCaseUpdate = (r: ParsedCaseRow) => ({
  externalId: r.externalId,
  caseLink: r.caseLink,
  firstName: r.firstName,
  lastName: r.lastName,
  approvalDate: r.approvalDate,
  levelWon: r.levelWon,
  claimType: r.claimType,
  claimTypeLabel: r.claimTypeLabel,
  aljFirstName: r.aljFirstName,
  aljLastName: r.aljLastName,
  updatedAt: new Date(),
});

const toFeeUpdate = (r: ParsedCaseRow, existingWinSheetLink: string | null) => ({
  assignedTo: r.assignedTo,
  winSheetStatus: r.winSheetStatus,
  // Preserve existing win sheet link — only write incoming if DB is currently empty
  winSheetLink: existingWinSheetLink ?? r.winSheetLink,
  winSheetLinkText: r.winSheetLinkText,
  caseStatus: r.caseStatus,
  feesConfirmation: r.feesConfirmation,
  dateAssignedToAgent: r.dateAssignedToAgent,
  approvedBy: r.approvedBy,
  t16Retro: r.t16Retro,
  t16FeeDue: r.t16FeeDue,
  t16FeeReceived: r.t16FeeReceived,
  t16Pending: r.t16Pending,
  t16FeeReceivedDate: r.t16FeeReceivedDate,
  t2Retro: r.t2Retro,
  t2FeeDue: r.t2FeeDue,
  t2FeeReceived: r.t2FeeReceived,
  t2Pending: r.t2Pending,
  t2FeeReceivedDate: r.t2FeeReceivedDate,
  auxRetro: r.auxRetro,
  auxFeeDue: r.auxFeeDue,
  auxFeeReceived: r.auxFeeReceived,
  auxPending: r.auxPending,
  auxFeeReceivedDate: r.auxFeeReceivedDate,
  daysAfterApproval: r.daysAfterApproval,
  approvalCategory: r.approvalCategory,
  feesStatus: r.feesStatus,
  weekAssignedToAgent: r.weekAssignedToAgent,
  monthAssignedToAgent: r.monthAssignedToAgent,
  updatedAt: new Date(),
});

// POST /api/sheets/sync
//   Query:
//     mode=preview  → fetch from n8n/mock, diff vs DB, return preview rows (no writes)
//     mode=upsert   → re-fetch, insert new cases, update fee_records for existing
export const POST = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode") ?? "preview";
    if (modeParam !== "preview" && modeParam !== "upsert") {
      return NextResponse.json({ error: `Invalid mode: ${modeParam}` }, { status: 400 });
    }
    const mode = modeParam;

    if (mode === "preview") {
      const { rows: rawRows, usingMock } = await fetchFromSheets();
      const { rows: parsed, warnings } = mapSheetRows(rawRows);

      const incomingIds = parsed.map((r) => r.clientId);
      let existingSet = new Set<number>();
      if (incomingIds.length > 0) {
        const existing = await db
          .select({ clientId: cases.clientId })
          .from(cases)
          .where(inArray(cases.clientId, incomingIds));
        existingSet = new Set(existing.map((e) => e.clientId));
      }

      const newCount = parsed.filter((r) => !existingSet.has(r.clientId)).length;

      return NextResponse.json({
        mode,
        usingMock,
        summary: {
          fetched: parsed.length,
          new: newCount,
          existing: parsed.length - newCount,
          warnings,
        },
        rows: parsed.map((r) => ({
          clientId: r.clientId,
          caseName: `${r.lastName}, ${r.firstName}`,
          caseLink: r.caseLink,
          externalUrl: r.externalId,
          approvalDate: r.approvalDate,
          assignedTo: r.assignedTo,
          winSheetStatus: r.winSheetStatus,
          winSheetLink: r.winSheetLink,
          winSheetLinkText: r.winSheetLinkText,
          levelWon: r.levelWon,
          claimType: r.claimTypeLabel,
          totalExpected:
            (Number(r.t16FeeDue) || 0) +
            (Number(r.t2FeeDue) || 0) +
            (Number(r.auxFeeDue) || 0),
          hasNotes: !!r.notes,
          isNew: !existingSet.has(r.clientId),
        })),
      });
    }

    // upsert mode
    let body: { selectedClientIds: unknown };
    try {
      body = (await req.json()) as { selectedClientIds: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!Array.isArray(body.selectedClientIds)) {
      return NextResponse.json(
        { error: "selectedClientIds must be an array" },
        { status: 400 },
      );
    }
    if (body.selectedClientIds.length > 1000) {
      return NextResponse.json(
        { error: "selectedClientIds exceeds maximum of 1000" },
        { status: 400 },
      );
    }
    const ids = (body.selectedClientIds as unknown[]).map(Number);
    if (ids.some((n) => !Number.isFinite(n))) {
      return NextResponse.json(
        { error: "selectedClientIds must contain only integers" },
        { status: 400 },
      );
    }
    const selectedSet = new Set(ids);

    const { rows: rawRows } = await fetchFromSheets();
    const { rows: parsed } = mapSheetRows(rawRows);
    const candidates = parsed.filter((r) => selectedSet.has(r.clientId));

    if (candidates.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0 });
    }

    const incomingIds = candidates.map((r) => r.clientId);
    const existing = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(inArray(cases.clientId, incomingIds));
    const existingSet = new Set(existing.map((e) => e.clientId));

    const newRows = candidates.filter((r) => !existingSet.has(r.clientId));
    const updateRows = candidates.filter((r) => existingSet.has(r.clientId));

    // Fetch existing win sheet links so we don't overwrite them during update
    const existingLinks = updateRows.length > 0
      ? await db
          .select({ caseId: feeRecords.caseId, winSheetLink: feeRecords.winSheetLink })
          .from(feeRecords)
          .where(inArray(feeRecords.caseId, updateRows.map((r) => r.clientId)))
      : [];
    const existingLinkMap = new Map(
      existingLinks.map((e) => [e.caseId, e.winSheetLink]),
    );

    let inserted = 0;
    let updated = 0;

    await db.transaction(async (tx) => {
      for (const batch of chunked(newRows, CHUNK)) {
        await tx.insert(cases).values(batch.map(toCaseInsert));
        await tx.insert(feeRecords).values(batch.map(toFeeInsert));
        const withNotes = batch.filter((r) => r.notes);
        if (withNotes.length > 0) {
          await tx.insert(activityLog).values(
            withNotes.map((r) => ({
              caseId: r.clientId,
              message: r.notes!,
              createdBy: "Sheet Sync",
            })),
          );
        }
        inserted += batch.length;
      }
      for (const r of updateRows) {
        await tx
          .update(cases)
          .set(toCaseUpdate(r))
          .where(eq(cases.clientId, r.clientId));
        await tx
          .update(feeRecords)
          .set(toFeeUpdate(r, existingLinkMap.get(r.clientId) ?? null))
          .where(eq(feeRecords.caseId, r.clientId));
        updated++;
      }
    });

    return NextResponse.json({ inserted, updated });
  } catch (error) {
    console.error("POST /api/sheets/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
