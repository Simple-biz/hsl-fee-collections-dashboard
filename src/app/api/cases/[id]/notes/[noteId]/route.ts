import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { requireCapability, guardStatus } from "@/lib/auth-helpers";

// DELETE /api/cases/:id/notes/:noteId — remove a single note (activity_log
// entry). Gated by case.delete (admins by default) since it destroys a record.
// The delete is scoped to the case id so a note can't be removed via the wrong
// case route.
export const DELETE = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) => {
  try {
    const guard = await requireCapability("case.delete");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const { id, noteId } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }
    if (!noteId) {
      return NextResponse.json({ error: "Invalid note id" }, { status: 400 });
    }

    const deleted = await db
      .delete(activityLog)
      .where(and(eq(activityLog.id, noteId), eq(activityLog.caseId, caseId)))
      .returning({ id: activityLog.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "ok", id: noteId });
  } catch (error) {
    console.error("DELETE /api/cases/[id]/notes/[noteId] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
