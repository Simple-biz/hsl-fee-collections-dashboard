"use server";

import { db } from "@/lib/db";
import { feeRecords, overpaidCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseBool, parseDate, parseDecimalString } from "@/lib/import/csv-parser";
import { resolveCaseId } from "@/lib/import/resolve-case";
import type { ImportResult } from "@/components/modals/CsvImportModal";
import { requireCapability } from "@/lib/auth-helpers";

const FIELD_KEYS = ["overpaidAmount", "opLtrDate", "opLtrReceived", "checksCleared", "updateNote", "region"] as const;

const NOTE_MAX_LENGTH = 5000;
const CONFIRMATION_MAX_LENGTH = 50; // matches feeRecords.feesConfirmation varchar(50)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// opLtrReceived accepts a date string ("YYYY-MM-DD") or null to clear it

type FieldKey = (typeof FIELD_KEYS)[number];
type Updates = Partial<Pick<typeof overpaidCases.$inferInsert, FieldKey>>;

type Result<T = void> = T extends void
  ? { ok: true } | { ok: false; error: string }
  : ({ ok: true } & T) | { ok: false; error: string };

export async function upsertOverpaidCase(input: {
  caseId: number;
  fields: Updates;
}): Promise<Result<{ data: typeof overpaidCases.$inferSelect }>> {
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

    if ("opLtrDate" in updates && updates.opLtrDate != null && !DATE_RE.test(updates.opLtrDate)) {
      return { ok: false, error: "Invalid date (expected YYYY-MM-DD)" };
    }

    if ("opLtrReceived" in updates && updates.opLtrReceived != null && !DATE_RE.test(updates.opLtrReceived)) {
      return { ok: false, error: "Invalid date (expected YYYY-MM-DD)" };
    }

    // Stamp checksClearedAt only when clearing (true); null it when un-clearing
    // (false) so the timestamp never misrepresents "when checks cleared".
    const clearedAtUpdate =
      "checksCleared" in updates
        ? { checksClearedAt: updates.checksCleared ? new Date() : null }
        : {};

    const [row] = await db
      .insert(overpaidCases)
      .values({ caseId: input.caseId, ...updates, ...clearedAtUpdate })
      .onConflictDoUpdate({
        target: overpaidCases.caseId,
        set: { ...updates, ...clearedAtUpdate, updatedAt: new Date() },
      })
      .returning();

    return { ok: true, data: row };
  } catch (error) {
    console.error("upsertOverpaidCase error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function bulkMarkCleared(input: {
  caseIds: number[];
}): Promise<Result> {
  try {
    if (!input.caseIds.length) return { ok: false, error: "No cases selected" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };
    const now = new Date();
    await db
      .insert(overpaidCases)
      .values(input.caseIds.map((caseId) => ({ caseId, checksCleared: true, checksClearedAt: now })))
      .onConflictDoUpdate({
        target: overpaidCases.caseId,
        set: { checksCleared: true, checksClearedAt: now, updatedAt: now },
      });
    return { ok: true };
  } catch (error) {
    console.error("bulkMarkCleared error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function bulkRestoreCleared(input: {
  caseIds: number[];
}): Promise<Result> {
  try {
    if (!input.caseIds.length) return { ok: false, error: "No cases to restore" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };
    const now = new Date();
    await db
      .insert(overpaidCases)
      .values(input.caseIds.map((caseId) => ({ caseId, checksCleared: false, checksClearedAt: null })))
      .onConflictDoUpdate({
        target: overpaidCases.caseId,
        set: { checksCleared: false, checksClearedAt: null, updatedAt: now },
      });
    return { ok: true };
  } catch (error) {
    console.error("bulkRestoreCleared error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function updateFeesConfirmation(input: {
  caseId: number;
  feesConfirmation: string;
}): Promise<Result<void>> {
  try {
    // Same gate as the Master Fees table's Fees Confirmation cell — this
    // action was the last unguarded path to the same field.
    const guard = await requireCapability("feesConfirmation.edit");
    if (!guard.ok) {
      return { ok: false, error: "You don't have permission to update PIF." };
    }

    if (!Number.isFinite(input.caseId)) {
      return { ok: false, error: "Invalid case ID" };
    }
    if (input.feesConfirmation.length > CONFIRMATION_MAX_LENGTH) {
      return {
        ok: false,
        error: `Confirmation too long (max ${CONFIRMATION_MAX_LENGTH} characters)`,
      };
    }
    await db
      .update(feeRecords)
      .set({ feesConfirmation: input.feesConfirmation || null })
      .where(eq(feeRecords.caseId, input.caseId));
    return { ok: true };
  } catch (error) {
    console.error("updateFeesConfirmation error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function bulkImportOverpaidCases(
  rawRows: Record<string, string>[],
): Promise<ImportResult> {
  // Marks every imported case's fee record as overpaid — the same mutation
  // POST /api/cases/bulk-overpaid gates behind case.finalize (lead/admin by
  // default). This CSV path was the one place that skipped the check.
  const guard = await requireCapability("case.finalize");
  if (!guard.ok) {
    return {
      imported: 0,
      failed: 0,
      rowErrors: [],
      error: "You don't have permission to import overpaid cases.",
    };
  }

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

    const values: Partial<typeof overpaidCases.$inferInsert> & { caseId: number } = {
      caseId: resolved.caseId,
    };
    let parseOk = true;

    if (raw["op_ltr_date"] !== undefined && raw["op_ltr_date"].trim()) {
      const d = parseDate(raw["op_ltr_date"]);
      if (!d) { rowErrors.push({ row: rowNum, error: "Invalid op_ltr_date" }); parseOk = false; }
      else values.opLtrDate = d;
    }

    if (parseOk && raw["op_ltr_received"] !== undefined && raw["op_ltr_received"].trim()) {
      const d = parseDate(raw["op_ltr_received"]);
      if (!d) { rowErrors.push({ row: rowNum, error: "Invalid op_ltr_received" }); parseOk = false; }
      else values.opLtrReceived = d;
    }

    if (parseOk && raw["overpaid_amount"] !== undefined && raw["overpaid_amount"].trim()) {
      const amount = parseDecimalString(raw["overpaid_amount"]);
      if (!amount) { rowErrors.push({ row: rowNum, error: "Invalid overpaid_amount" }); parseOk = false; }
      else values.overpaidAmount = amount;
    }

    if (parseOk && raw["checks_cleared"] !== undefined && raw["checks_cleared"].trim()) {
      const b = parseBool(raw["checks_cleared"]);
      if (b === null) { rowErrors.push({ row: rowNum, error: "Invalid checks_cleared value" }); parseOk = false; }
      else {
        values.checksCleared = b;
        if (b) values.checksClearedAt = new Date();
      }
    }

    if (parseOk && raw["region"] !== undefined) {
      values.region = raw["region"].trim() || null;
    }

    if (parseOk && raw["update_note"] !== undefined) {
      const note = raw["update_note"].trim();
      if (note.length > 5000) { rowErrors.push({ row: rowNum, error: "update_note exceeds 5000 characters" }); parseOk = false; }
      else values.updateNote = note;
    }

    if (!parseOk) continue;

    try {
      await db
        .insert(overpaidCases)
        .values(values)
        .onConflictDoUpdate({
          target: overpaidCases.caseId,
          set: { ...values, updatedAt: new Date() },
        });
      // Mark the fee_record as overpaid so the page query picks it up
      await db
        .update(feeRecords)
        .set({ markedOverpaid: true })
        .where(eq(feeRecords.caseId, resolved.caseId));
      imported++;
    } catch {
      rowErrors.push({ row: rowNum, error: "Database error — row skipped" });
    }
  }

  return { imported, failed: rowErrors.length, rowErrors };
}
