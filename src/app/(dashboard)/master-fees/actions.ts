"use server";

import { db } from "@/lib/db";
import { feeRecords } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireCapability } from "@/lib/auth-helpers";
import { auth } from "@/auth";

// Same shape as the sibling action files (overpaid-cases, fee-petitions).
type Result<T = void> = T extends void
  ? { ok: true } | { ok: false; error: string }
  : ({ ok: true } & T) | { ok: false; error: string };

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

// Adds the selected cases to the Fee Petitions page. Membership used to be
// derived from the case's Level being "Fee Petition"; it's now this explicit
// flag (see migration 0055), so picking that Level no longer adds anything.
//
// Open to all authenticated users — any staff member with Master Fees access
// can add a case. Removing is separately gated on feePetition.manage so those
// stay asymmetric by design: lower bar to add, higher bar to undo.
//
// Scoped to open cases. The UI already hides the button in closed mode, so
// this is belt-and-braces, but it matters: any write to fee_records fires
// compute_fee_totals, which on a CLOSED row resets the sheet-sourced Pending
// that the Fees Closed sync deliberately wrote (see migration 0055's note).
// Keeping the scope here means that can't happen even if the button is later
// exposed somewhere it isn't today.
// Returns the ids actually updated, which can be fewer than were asked for
// when the is_closed scope excludes one — someone else may have closed a case
// between the confirm dialog opening and being confirmed. The caller needs the
// real list so its optimistic row update matches what the database did.
export async function bulkAddToFeePetitions(input: {
  caseIds: number[];
}): Promise<Result<{ updated: number[] }>> {
  try {
    const session = await auth();
    if (!session?.user) return { ok: false, error: "Unauthenticated" };
    if (!input.caseIds.length) return { ok: false, error: "No cases selected" };
    if (input.caseIds.length > 500) return { ok: false, error: "Too many cases (max 500)" };
    if (!input.caseIds.every((id) => Number.isFinite(id))) return { ok: false, error: "Invalid case IDs" };

    const rows = await db
      .update(feeRecords)
      .set({ inFeePetition: true, updatedAt: new Date() })
      .where(and(inArray(feeRecords.caseId, input.caseIds), eq(feeRecords.isClosed, false)))
      .returning({ caseId: feeRecords.caseId });
    return { ok: true, updated: rows.map((r) => r.caseId) };
  } catch (error) {
    console.error("bulkAddToFeePetitions error:", error);
    return { ok: false, error: "Server error" };
  }
}
