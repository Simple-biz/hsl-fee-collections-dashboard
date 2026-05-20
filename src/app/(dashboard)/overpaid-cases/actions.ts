"use server";

import { db } from "@/lib/db";
import { feeRecords, overpaidCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const FIELD_KEYS = ["opLtrReceived", "checksCleared", "updateNote"] as const;

const NOTE_MAX_LENGTH = 5000;
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

    if ("opLtrReceived" in updates && updates.opLtrReceived != null && !DATE_RE.test(updates.opLtrReceived)) {
      return { ok: false, error: "Invalid date (expected YYYY-MM-DD)" };
    }

    const [row] = await db
      .insert(overpaidCases)
      .values({ caseId: input.caseId, ...updates })
      .onConflictDoUpdate({
        target: overpaidCases.caseId,
        set: { ...updates, updatedAt: new Date() },
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
    await db
      .insert(overpaidCases)
      .values(input.caseIds.map((caseId) => ({ caseId, checksCleared: true })))
      .onConflictDoUpdate({
        target: overpaidCases.caseId,
        set: { checksCleared: true, updatedAt: new Date() },
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
    await db
      .insert(overpaidCases)
      .values(input.caseIds.map((caseId) => ({ caseId, checksCleared: false })))
      .onConflictDoUpdate({
        target: overpaidCases.caseId,
        set: { checksCleared: false, updatedAt: new Date() },
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
    if (!Number.isFinite(input.caseId)) {
      return { ok: false, error: "Invalid case ID" };
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
