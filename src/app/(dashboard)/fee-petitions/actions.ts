"use server";

import { db } from "@/lib/db";
import { feePetitions, feeRecords } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { parseBool } from "@/lib/import/csv-parser";
import { resolveCaseId } from "@/lib/import/resolve-case";
import { requireCapability, requirePageAccess } from "@/lib/auth-helpers";
import type { ImportResult } from "@/components/modals/CsvImportModal";

// The Remarks value written to Master Fees when a lead approves a petition
// via the checkbox. FeeRecordsTable.tsx's CASE_STATUS_COLORS uses the same
// literal for badge styling. This is a one-way push: the checkbox sets this
// value in Remarks, but Remarks being set to this string does NOT set the
// checkbox (reverse sync intentionally removed — see route.ts PATCH handler).
const FEE_PETITION_APPROVED_REMARKS = "FEE PETITION APPROVED";

const FIELD_KEYS = [
  "assignedTo",
  "noa",
  "timeDelineation",
  "feePetitionDoc",
  "ltrToClmt",
  "ltrToClmtWithSignature",
  "ltrToAlj",
  "faxConfFeePet",
  "feePetitionApproved",
  "updateNote",
  "nextFollowUpDate",
] as const;

const NOTE_MAX_LENGTH = 5000;

type FieldKey = (typeof FIELD_KEYS)[number];
type Updates = Partial<Pick<typeof feePetitions.$inferInsert, FieldKey>>;

type Result<T = void> = T extends void
  ? { ok: true } | { ok: false; error: string }
  : ({ ok: true } & T) | { ok: false; error: string };

export async function upsertFeePetition(input: {
  caseId: number;
  fields: Updates;
}): Promise<Result<{ data: typeof feePetitions.$inferSelect }>> {
  try {
    if (!Number.isFinite(input.caseId)) {
      return { ok: false, error: "Invalid case ID" };
    }

    const updates: Updates = {};
    for (const key of FIELD_KEYS) {
      if (key in input.fields) {
        (updates as Record<string, unknown>)[key] = input.fields[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return { ok: false, error: "No valid fields to update" };
    }

    if (typeof updates.updateNote === "string" && updates.updateNote.length > NOTE_MAX_LENGTH) {
      return { ok: false, error: `Note too long (max ${NOTE_MAX_LENGTH} characters)` };
    }

    // Unlike the rest of this file's checklist fields, checking this one
    // reaches into fee_records — the same field Master Fees gates behind
    // case.update — so this specific write needs the same gate, even though
    // the plain checklist toggles below intentionally don't require it.
    if (updates.feePetitionApproved === true) {
      const guard = await requireCapability("case.update");
      if (!guard.ok) {
        return { ok: false, error: "You don't have permission to approve fee petitions." };
      }
    }

    // Checking "Fee Petition Approved" here also sets Remarks on Master Fees
    // to "FEE PETITION APPROVED" so the two stay visible together. This is
    // intentionally one-way: only the checkbox here can approve a petition;
    // editing Remarks directly in Master Fees no longer triggers this flag
    // (the reverse sync was removed so that agents cannot self-approve by
    // picking a Remarks value without a lead/Lori reviewing first).
    const row = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(feePetitions)
        .values({ caseId: input.caseId, ...updates })
        .onConflictDoUpdate({
          target: feePetitions.caseId,
          set: { ...updates, updatedAt: new Date() },
        })
        .returning();

      if (updates.feePetitionApproved === true) {
        await tx
          .update(feeRecords)
          .set({ caseStatus: FEE_PETITION_APPROVED_REMARKS, updatedAt: new Date() })
          .where(eq(feeRecords.caseId, input.caseId));
      }

      return r;
    });

    return { ok: true, data: row };
  } catch (error) {
    console.error("upsertFeePetition error:", error);
    return { ok: false, error: "Server error" };
  }
}

// Takes the selected cases back out of the Fee Petitions page — the
// counterpart to "Add to Fee Petitions" on Master Fees, and now the only way
// a case leaves this section short of being closed to Fees Closed (changing
// the case's Level no longer removes it; see migration 0055).
//
// Only the membership flag is cleared: the fee_petitions row, its checklist,
// assignee and notes all survive, so a case removed by mistake comes back
// exactly as it was when it's re-added. Guarded on page access to match the
// add side — anyone who can work this page can take a case off it.
//
// Scoped to open cases, like bulkAddToFeePetitions. This page never lists a
// closed case so the scope is unreachable today, but any write to a closed
// fee_records row makes compute_fee_totals reset its sheet-sourced Pending
// (see migration 0055's note) — worth making structural rather than incidental.
export async function bulkRemoveFromFeePetitions(input: {
  caseIds: number[];
}): Promise<Result> {
  try {
    const guard = await requirePageAccess("fee_petitions");
    if (!guard.ok) return { ok: false, error: "You don't have permission to remove cases from Fee Petitions." };
    if (!input.caseIds.length) return { ok: false, error: "No cases selected" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };

    await db
      .update(feeRecords)
      .set({ inFeePetition: false, updatedAt: new Date() })
      .where(and(inArray(feeRecords.caseId, input.caseIds), eq(feeRecords.isClosed, false)));
    return { ok: true };
  } catch (error) {
    console.error("bulkRemoveFromFeePetitions error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function bulkMarkComplete(input: {
  caseIds: number[];
}): Promise<Result> {
  try {
    if (!input.caseIds.length) return { ok: false, error: "No cases selected" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };
    const allTrue = {
      timeDelineation: true,
      feePetitionDoc: true,
      ltrToClmt: true,
      ltrToClmtWithSignature: true,
      ltrToAlj: true,
      faxConfFeePet: true,
    };
    await db
      .insert(feePetitions)
      .values(input.caseIds.map((caseId) => ({ caseId, ...allTrue })))
      .onConflictDoUpdate({
        target: feePetitions.caseId,
        set: { ...allTrue, updatedAt: new Date() },
      });
    return { ok: true };
  } catch (error) {
    console.error("bulkMarkComplete error:", error);
    return { ok: false, error: "Server error" };
  }
}

type ChecklistFields = {
  timeDelineation: boolean;
  feePetitionDoc: boolean;
  ltrToClmt: boolean;
  ltrToClmtWithSignature: boolean;
  ltrToAlj: boolean;
  faxConfFeePet: boolean;
};

export async function bulkRestoreChecklists(input: {
  rows: Array<{ caseId: number; fields: ChecklistFields }>;
}): Promise<Result> {
  try {
    if (!input.rows.length) return { ok: false, error: "No cases to restore" };
    if (input.rows.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.rows.every((r) => Number.isFinite(r.caseId))) return { ok: false, error: "Invalid case IDs" };

    await db.transaction(async (tx) => {
      for (const r of input.rows) {
        await tx
          .update(feePetitions)
          .set({ ...r.fields, updatedAt: new Date() })
          .where(eq(feePetitions.caseId, r.caseId));
      }
    });
    return { ok: true };
  } catch (error) {
    console.error("bulkRestoreChecklists error:", error);
    return { ok: false, error: "Server error" };
  }
}

const BOOL_KEYS = [
  "noa",
  "time_delineation",
  "fee_petition_doc",
  "ltr_to_clmt",
  "ltr_to_clmt_with_signature",
  "ltr_to_alj",
  "fax_conf_fee_pet",
] as const;

export async function bulkImportFeePetitions(
  rawRows: Record<string, string>[],
): Promise<ImportResult> {
  let imported = 0;
  const rowErrors: ImportResult["rowErrors"] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 1;

    const resolved = await resolveCaseId(raw["client_id"] ?? "");
    if ("error" in resolved) {
      rowErrors.push({ row: rowNum, error: resolved.error });
      continue;
    }

    const values: Partial<typeof feePetitions.$inferInsert> = {
      caseId: resolved.caseId,
    };

    let parseOk = true;
    for (const key of BOOL_KEYS) {
      const cell = raw[key];
      if (cell === undefined) continue;
      const b = parseBool(cell);
      if (b === null) {
        rowErrors.push({ row: rowNum, error: `Invalid boolean value for "${key}": "${cell}"` });
        parseOk = false;
        break;
      }
      const schemaKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof typeof feePetitions.$inferInsert;
      (values as Record<string, unknown>)[schemaKey] = b;
    }

    if (!parseOk) continue;

    if (raw["update_note"] !== undefined) {
      const note = raw["update_note"].trim();
      if (note.length > 5000) {
        rowErrors.push({ row: rowNum, error: "update_note exceeds 5000 characters" });
        continue;
      }
      values.updateNote = note;
    }

    try {
      await db
        .insert(feePetitions)
        .values(values as typeof feePetitions.$inferInsert)
        .onConflictDoUpdate({
          target: feePetitions.caseId,
          set: { ...values, updatedAt: new Date() },
        });
      imported++;
    } catch {
      rowErrors.push({ row: rowNum, error: "Database error — row skipped" });
    }
  }

  return { imported, failed: rowErrors.length, rowErrors };
}
