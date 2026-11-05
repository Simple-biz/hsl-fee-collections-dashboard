"use server";

import { db } from "@/lib/db";
import { referrals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireCapability } from "@/lib/auth-helpers";

type Result<T = void> = T extends void
  ? { ok: true } | { ok: false; error: string }
  : ({ ok: true } & T) | { ok: false; error: string };

export async function removeReferral(input: {
  caseId: number;
}): Promise<Result> {
  try {
    const guard = await requireCapability("case.update");
    if (!guard.ok) return { ok: false, error: "You don't have permission to remove referrals." };
    if (!Number.isFinite(input.caseId)) return { ok: false, error: "Invalid case ID" };

    await db.delete(referrals).where(eq(referrals.caseId, input.caseId));
    return { ok: true };
  } catch (error) {
    console.error("removeReferral error:", error);
    return { ok: false, error: "Server error" };
  }
}

export async function updateReferralNotes(input: {
  caseId: number;
  notes: string;
}): Promise<Result> {
  try {
    const guard = await requireCapability("case.update");
    if (!guard.ok) return { ok: false, error: "You don't have permission to edit referrals." };
    if (!Number.isFinite(input.caseId)) return { ok: false, error: "Invalid case ID" };
    if (input.notes.length > 5000) return { ok: false, error: "Notes too long (max 5000 characters)" };

    await db
      .update(referrals)
      .set({ notes: input.notes, updatedAt: new Date() })
      .where(eq(referrals.caseId, input.caseId));
    return { ok: true };
  } catch (error) {
    console.error("updateReferralNotes error:", error);
    return { ok: false, error: "Server error" };
  }
}
