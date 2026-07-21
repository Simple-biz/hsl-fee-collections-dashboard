"use server";

import { db } from "@/lib/db";
import { feeRecords } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { requireCapability } from "@/lib/auth-helpers";

type Result = { ok: true } | { ok: false; error: string };

export async function bulkReassign(input: {
  caseIds: number[];
  assignedTo: string;
}): Promise<Result> {
  try {
    const guard = await requireCapability("case.update");
    if (!guard.ok) return { ok: false, error: "You don't have permission to reassign cases." };
    if (!input.caseIds.length) return { ok: false, error: "No cases selected" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };
    if (!input.assignedTo.trim()) return { ok: false, error: "Agent name required" };

    await db
      .update(feeRecords)
      .set({ assignedTo: input.assignedTo === "—" ? "" : input.assignedTo, updatedAt: new Date() })
      .where(inArray(feeRecords.caseId, input.caseIds));
    return { ok: true };
  } catch (error) {
    console.error("bulkReassign error:", error);
    return { ok: false, error: "Server error" };
  }
}
