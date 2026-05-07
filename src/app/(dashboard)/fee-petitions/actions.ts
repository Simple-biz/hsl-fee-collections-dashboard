"use server";

import { db } from "@/lib/db";
import { feePetitions } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";

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

type Result<T = void> = ({ ok: true } & T) | { ok: false; error: string };

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

    revalidatePath("/fee-petitions");
    return { ok: true, data: row };
  } catch (error) {
    console.error("upsertFeePetition error:", error);
    return { ok: false, error: (error as Error).message };
  }
}
