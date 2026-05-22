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

// POST /api/sheets/sync
//   mode=preview  → diff MASTER LIST + Fees Closed sheet vs DB; return all 4 categories
//   mode=upsert   → import new rows + update existing (fees_closed move is TODO)
export const POST = async (req: NextRequest) => {
  try {
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
    const ids = (body.selectedClientIds as unknown[]).map(Number);
    if (ids.some((n) => !Number.isFinite(n))) {
      return NextResponse.json(
        { error: "selectedClientIds must contain only integers" },
        { status: 400 },
      );
    }
    const selectedSet = new Set(ids);

    const { rows: rawRows } = await fetchMasterListRows();
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

    // TODO: handle fees_closed moves once Sir Jeru's fees_closed schema lands.
    // On upsert, feesClosedClientIds (passed separately) should be:
    //   1. Inserted into fees_closed table
    //   2. Deleted from cases table
    // Wire up here when schema is ready.

    return NextResponse.json({ inserted, updated });
  } catch (error) {
    console.error("POST /api/sheets/sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
};
