"use server";

import { db } from "@/lib/db";
import { feeRecords, overpaidCases } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
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

// Removes cases from the Overpaid Cases view without touching
// fees_confirmation/is_closed/marked_overpaid — Master Fees and Fees Closed
// are keyed off the former two, and marked_overpaid stays mathematically
// accurate (the compute_fee_totals trigger re-derives it on every write
// regardless, so fighting it directly doesn't stick). Instead this stamps
// overpaid_dismissed_at, which the page's query excludes on, and which the
// trigger only clears when a case transitions into a genuinely *new*
// overpayment. Also deletes the overpaid_cases metadata row so a case that
// becomes overpaid again later starts clean rather than resurfacing stale
// op-letter/checks-cleared data.
export async function bulkRemoveFromOverpaid(input: {
  caseIds: number[];
}): Promise<Result> {
  try {
    const guard = await requireCapability("case.finalize");
    if (!guard.ok) return { ok: false, error: "You don't have permission to remove overpaid cases." };
    if (!input.caseIds.length) return { ok: false, error: "No cases selected" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };

    await db.transaction(async (tx) => {
      await tx
        .update(feeRecords)
        .set({ overpaidDismissedAt: new Date(), updatedAt: new Date() })
        .where(inArray(feeRecords.caseId, input.caseIds));
      await tx.delete(overpaidCases).where(inArray(overpaidCases.caseId, input.caseIds));
    });
    return { ok: true };
  } catch (error) {
    console.error("bulkRemoveFromOverpaid error:", error);
    return { ok: false, error: "Server error" };
  }
}

// Marks a single case overpaid directly — for old cases that never came
// through Master Fees and shouldn't be added there just to flag them here.
// The normal path (setting PIF to "Overpaid" on Master Fees) already sets
// marked_overpaid atomically; this covers the escape hatch for cases with
// no fee history to track at all, right after AddCaseModal creates the bare
// case record.
export async function markCaseOverpaid(input: {
  caseId: number;
}): Promise<Result> {
  try {
    const guard = await requireCapability("case.finalize");
    if (!guard.ok) return { ok: false, error: "You don't have permission to mark cases overpaid." };
    if (!Number.isFinite(input.caseId)) return { ok: false, error: "Invalid case ID" };

    await db
      .update(feeRecords)
      .set({ markedOverpaid: true, overpaidDismissedAt: null, updatedAt: new Date() })
      .where(eq(feeRecords.caseId, input.caseId));
    return { ok: true };
  } catch (error) {
    console.error("markCaseOverpaid error:", error);
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
