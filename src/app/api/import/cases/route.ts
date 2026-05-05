import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { parseWorksheet, type ParsedCaseRow } from "@/lib/import/xlsx-mapper";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK = 500;

const chunked = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
});

// POST /api/import/cases
//   Body (multipart):
//     file               — .xlsx file (required)
//     selectedClientIds  — optional JSON array of clientIds; restricts which rows are imported
//   Query:
//     mode=preview  → analyze + return per-row preview data, no writes (default)
//     mode=append   → insert rows whose clientId is not in DB (subject to selectedClientIds filter)
//     mode=replace  → TRUNCATE cases then insert everything (subject to selectedClientIds filter)
export const POST = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get("mode") ?? "preview") as
      | "preview"
      | "append"
      | "replace";

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing 'file' field" },
        { status: 400 },
      );
    }

    let selectedSet: Set<number> | null = null;
    const sel = form.get("selectedClientIds");
    if (typeof sel === "string" && sel.length > 0) {
      try {
        const arr = JSON.parse(sel);
        if (Array.isArray(arr)) selectedSet = new Set(arr.map(Number));
      } catch {
        return NextResponse.json(
          { error: "selectedClientIds must be JSON array" },
          { status: 400 },
        );
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseWorksheet(buffer);

    // Look up which clientIds already exist
    const incomingIds = parsed.rows.map((r) => r.clientId);
    let existingSet = new Set<number>();
    if (incomingIds.length > 0) {
      const existing = await db
        .select({ clientId: cases.clientId })
        .from(cases)
        .where(inArray(cases.clientId, incomingIds));
      existingSet = new Set(existing.map((e) => e.clientId));
    }

    const newRows = parsed.rows.filter((r) => !existingSet.has(r.clientId));
    const summary = {
      parsed: parsed.rows.length,
      new: newRows.length,
      duplicates: parsed.rows.length - newRows.length,
      warnings: parsed.warnings,
    };

    if (mode === "preview") {
      const previewRows = parsed.rows.map((r) => ({
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
        hasNotes: !!r.notes && r.notes.length > 0,
        isDuplicate: existingSet.has(r.clientId),
      }));
      return NextResponse.json({
        mode,
        summary,
        rows: previewRows,
      });
    }

    // For write modes, filter by selectedClientIds if provided
    let candidates = mode === "replace" ? parsed.rows : newRows;
    if (selectedSet) {
      candidates = candidates.filter((r) => selectedSet!.has(r.clientId));
    }

    let inserted = 0;
    let activityInserted = 0;

    await db.transaction(async (tx) => {
      if (mode === "replace") {
        await tx.execute(
          sql`TRUNCATE TABLE ${cases} RESTART IDENTITY CASCADE`,
        );
      }

      if (candidates.length === 0) return;

      for (const batch of chunked(candidates, CHUNK)) {
        await tx.insert(cases).values(batch.map(toCaseInsert));
        await tx.insert(feeRecords).values(batch.map(toFeeInsert));

        const notesBatch = batch
          .filter((r) => r.notes && r.notes.length > 0)
          .map((r) => ({
            caseId: r.clientId,
            message: r.notes!,
            createdBy: "import",
            createdAt: r.approvalDate ? new Date(r.approvalDate) : new Date(),
          }));
        if (notesBatch.length) {
          await tx.insert(activityLog).values(notesBatch);
          activityInserted += notesBatch.length;
        }
        inserted += batch.length;
      }
    });

    return NextResponse.json({
      mode,
      summary,
      inserted,
      activityLogEntries: activityInserted,
    });
  } catch (error) {
    console.error("POST /api/import/cases error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
