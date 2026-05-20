"use server";

import { db } from "@/lib/db";
import { feePetitions } from "@/lib/db/schema";

const FIELD_KEYS = [
  "noa",
  "timeDelineation",
  "feePetitionDoc",
  "ltrToClmt",
  "ltrToClmtWithSignature",
  "ltrToAlj",
  "faxConfFeePet",
  "updateNote",
] as const;

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

    const [row] = await db
      .insert(feePetitions)
      .values({ caseId: input.caseId, ...updates })
      .onConflictDoUpdate({
        target: feePetitions.caseId,
        set: { ...updates, updatedAt: new Date() },
      })
      .returning();

    return { ok: true, data: row };
  } catch (error) {
    console.error("upsertFeePetition error:", error);
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
      noa: true,
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
