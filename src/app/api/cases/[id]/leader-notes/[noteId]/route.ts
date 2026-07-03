import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaderNotes } from "@/lib/db/schema";
import { requireCapability, guardStatus } from "@/lib/auth-helpers";

// DELETE /api/cases/:id/leader-notes/:noteId — remove a single leader note.
// Gated by leaderNotes.access (not the stricter case.delete used by the
// general notes thread) since the audience here is already narrowed to
// lead/admin — any lead who can post should be able to clean up their own
// mistaken entry. Scoped to the case id so a note can't be removed via the
// wrong case route.
export const DELETE = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) => {
  try {
    const guard = await requireCapability("leaderNotes.access");
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
      .delete(leaderNotes)
      .where(and(eq(leaderNotes.id, noteId), eq(leaderNotes.caseId, caseId)))
      .returning({ id: leaderNotes.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "ok", id: noteId });
  } catch (error) {
    console.error("DELETE /api/cases/[id]/leader-notes/[noteId] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
