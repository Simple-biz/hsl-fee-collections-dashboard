import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  mapSheetRows,
  MOCK_SHEET_ROWS,
  SYNTHETIC_ID_BASE,
  type SheetRow,
} from "@/lib/import/sheets-mapper";
import { mapFeesClosedRows } from "@/lib/import/fees-closed-mapper";
import type { ParsedCaseRow } from "@/lib/import/xlsx-mapper";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK = 500;

const chunked = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const fetchMasterListRows = async (): Promise<{
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

const fetchFeesClosedSheetRows = async (): Promise<SheetRow[]> => {
  const webhookUrl = process.env.FEES_CLOSED_SYNC_WEBHOOK_URL;
  if (!webhookUrl) return [];
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "manual" }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as SheetRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
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

const toClosedAt = (closedDate: string | null): Date | null => {
  if (!closedDate) return null;
  const parsed = new Date(`${closedDate}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// POST /api/sheets/sync
//   mode=preview  → diff MASTER LIST + Fees Closed sheet vs DB; return all 4 categories
//   mode=upsert   → import new rows, update existing, and mark Fees Closed rows closed
export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const modeParam = searchParams.get("mode") ?? "preview";
    if (modeParam !== "preview" && modeParam !== "upsert") {
      return NextResponse.json({ error: `Invalid mode: ${modeParam}` }, { status: 400 });
    }
    const mode = modeParam;

    if (mode === "preview") {
      // Fetch MASTER LIST and Fees Closed sheet in parallel
      const [{ rows: masterRaw, usingMock }, feesClosedRaw] = await Promise.all([
        fetchMasterListRows(),
        fetchFeesClosedSheetRows(),
      ]);

      const { rows: parsed, warnings } = mapSheetRows(masterRaw);
      const { rows: feesClosedParsed } = mapFeesClosedRows(feesClosedRaw);

      // Build lookup sets
      const sheetClientIdSet = new Set(parsed.map((r) => r.clientId));
      const feesClosedCaseNameSet = new Set(
        feesClosedParsed.map((r) => r.caseName.trim()),
      );


      // Pull all DB cases (lightweight: only fields needed for diff + display)
      const allDbCases = await db
        .select({
          clientId: cases.clientId,
          caseLink: cases.caseLink,
          firstName: cases.firstName,
          lastName: cases.lastName,
          approvalDate: cases.approvalDate,
        })
        .from(cases);

      const dbClientIdSet = new Set(allDbCases.map((c) => c.clientId));

      // Category 1 & 2: sheet rows — new vs existing
      const sheetRows = parsed.map((r) => ({
        clientId: r.clientId,
        caseName: `${r.lastName}, ${r.firstName}`,
        caseLink: r.caseLink,
        externalUrl: r.externalId,
        approvalDate: r.approvalDate,
        assignedTo: r.assignedTo,
        winSheetStatus: r.winSheetStatus,
        winSheetLink: r.winSheetLink,
        winSheetLinkText: r.winSheetLinkText,
        totalExpected:
          (Number(r.t16FeeDue) || 0) +
          (Number(r.t2FeeDue) || 0) +
          (Number(r.auxFeeDue) || 0),
        hasNotes: !!r.notes,
        isSynthetic: r.clientId >= SYNTHETIC_ID_BASE,
        status: dbClientIdSet.has(r.clientId) ? "existing" : "new",
      }));

      // Category 3 & 4: DB-only rows
      const dbOnlyCases = allDbCases.filter(
        (c) => !sheetClientIdSet.has(c.clientId),
      );

      const feesClosedRows = dbOnlyCases
        .filter((c) => c.caseLink && feesClosedCaseNameSet.has(c.caseLink.trim()))
        .map((c) => ({
          clientId: c.clientId,
          caseName: `${c.lastName}, ${c.firstName}`,
          caseLink: c.caseLink ?? "",
          approvalDate: c.approvalDate,
          status: "fees_closed" as const,
        }));

      const missingRows = dbOnlyCases
        .filter((c) => !c.caseLink || !feesClosedCaseNameSet.has(c.caseLink.trim()))
        .map((c) => ({
          clientId: c.clientId,
          caseName: `${c.lastName}, ${c.firstName}`,
          caseLink: c.caseLink ?? "",
          approvalDate: c.approvalDate,
          status: "missing" as const,
        }));

      const newCount = sheetRows.filter((r) => r.status === "new").length;

      return NextResponse.json({
        mode,
        usingMock,
        summary: {
          fetched: parsed.length,
          new: newCount,
          existing: parsed.length - newCount,
          feesClosed: feesClosedRows.length,
          missing: missingRows.length,
          synthetic: sheetRows.filter((r) => r.isSynthetic).length,
          warnings,
        },
        rows: {
          sheet: sheetRows,
          feesClosed: feesClosedRows,
          missing: missingRows,
        },
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
    const ids = Array.from(new Set((body.selectedClientIds as unknown[]).map(Number)));

    if (ids.some((n) => !Number.isInteger(n))) {
      return NextResponse.json(
        { error: "selectedClientIds must contain only integers" },
        { status: 400 },
      );
    }

    const selectedSet = new Set(ids);

    const [{ rows: rawRows }, feesClosedRaw] = await Promise.all([
      fetchMasterListRows(),
      fetchFeesClosedSheetRows(),
    ]);
    const { rows: parsed } = mapSheetRows(rawRows);
    const { rows: feesClosedParsed } = mapFeesClosedRows(feesClosedRaw);

    const seenCandidates = new Set<number>();

    const candidates = parsed.filter((r) => {
      if (!selectedSet.has(r.clientId)) return false;
      if (seenCandidates.has(r.clientId)) return false;

      seenCandidates.add(r.clientId);
      return true;
    });

    const sheetClientIdSet = new Set(parsed.map((r) => r.clientId));
    const feesClosedByCaseName = new Map(
      feesClosedParsed.map((r) => [r.caseName.trim(), r]),
    );

    const selectedDbCases =
      ids.length > 0
        ? await db
            .select({ clientId: cases.clientId, caseLink: cases.caseLink })
            .from(cases)
            .where(inArray(cases.clientId, ids))
        : [];

    const feesClosedMatches = selectedDbCases.flatMap((c) => {
      if (sheetClientIdSet.has(c.clientId) || !c.caseLink) return [];
      const feesClosedRow = feesClosedByCaseName.get(c.caseLink.trim());
      return feesClosedRow
        ? [{ clientId: c.clientId, closedAt: toClosedAt(feesClosedRow.closedDate) }]
        : [];
    });

    if (candidates.length === 0 && feesClosedMatches.length === 0) {
      return NextResponse.json({ inserted: 0, updated: 0, closed: 0 });
    }

    const incomingIds = candidates.map((r) => r.clientId);
    const existing =
      incomingIds.length > 0
        ? await db
            .select({ clientId: cases.clientId })
            .from(cases)
            .where(inArray(cases.clientId, incomingIds))
        : [];
    const existingSet = new Set(existing.map((e) => e.clientId));

    const newRows = candidates.filter((r) => !existingSet.has(r.clientId));
    const updateRows = candidates.filter((r) => existingSet.has(r.clientId));

    const existingLinks =
      updateRows.length > 0
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
    let closed = 0;

    await db.transaction(async (tx) => {
      for (const batch of chunked(newRows, CHUNK)) {
        const insertedCases = await tx
          .insert(cases)
          .values(batch.map(toCaseInsert))
          .onConflictDoNothing({
            target: cases.clientId,
          })
          .returning({ clientId: cases.clientId });

        const insertedClientIds = new Set(insertedCases.map((r) => r.clientId));
        const insertedRows = batch.filter((r) => insertedClientIds.has(r.clientId));

        if (insertedRows.length === 0) continue;

        await tx
          .insert(feeRecords)
          .values(insertedRows.map(toFeeInsert))
          .onConflictDoNothing({
            target: feeRecords.caseId,
          });

        const withNotes = insertedRows.filter((r) => r.notes);
        if (withNotes.length > 0) {
          await tx.insert(activityLog).values(
            withNotes.map((r) => ({
              caseId: r.clientId,
              message: r.notes!,
              createdBy: "Sheet Sync",
            })),
          );
        }

        inserted += insertedRows.length;
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

      for (const batch of chunked(feesClosedMatches, CHUNK)) {
        if (batch.length === 0) continue;

        for (const row of batch) {
          await tx
            .update(feeRecords)
            .set({
              isClosed: true,
              closedAt: row.closedAt,
              winSheetStatus: "closed",
              syncStatus: "synced",
              syncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(feeRecords.caseId, row.clientId));
        }

        await tx.insert(activityLog).values(
          batch.map((row) => ({
            caseId: row.clientId,
            message: "Marked closed from Fees Closed sheet during Google Sheets sync.",
            createdBy: "Sheet Sync",
          })),
        );
        closed += batch.length;
      }
    });

    return NextResponse.json({ inserted, updated, closed });
  } catch (error) {
    console.error("POST /api/sheets/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
