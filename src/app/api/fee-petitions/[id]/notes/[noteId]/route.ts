import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { activityLog, feePetitions } from "@/lib/db/schema";
import { requirePageAccess, guardStatus, sessionHasCapability } from "@/lib/auth-helpers";

const canModifyNote = (session: Session, createdBy: string | null) => {
  const author = session.user?.name?.trim();
  return (!!author && author === createdBy) || sessionHasCapability(session, "case.delete");
};

const editNoteSchema = z.object({
  message: z.string().trim().min(1, "Note can't be empty"),
});

// PATCH /api/fee-petitions/:id/notes/:noteId — edit a log entry
export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) => {
  try {
    const guard = await requirePageAccess("fee_petitions");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });
    }

    const { id, noteId } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }
    if (!noteId) {
      return NextResponse.json({ error: "Invalid note id" }, { status: 400 });
    }

    const parsed = editNoteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const [petition] = await db
      .select({ id: feePetitions.id })
      .from(feePetitions)
      .where(eq(feePetitions.caseId, caseId));
    if (!petition) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const [existing] = await db
      .select({ createdBy: activityLog.createdBy })
      .from(activityLog)
      .where(and(eq(activityLog.id, noteId), eq(activityLog.feePetitionId, petition.id)));
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    if (!canModifyNote(guard.session, existing.createdBy)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [updated] = await db
      .update(activityLog)
      .set({ message: parsed.data.message, editedAt: new Date() })
      .where(and(eq(activityLog.id, noteId), eq(activityLog.feePetitionId, petition.id)))
      .returning({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
        editedAt: activityLog.editedAt,
      });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/fee-petitions/[id]/notes/[noteId] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
};

// DELETE /api/fee-petitions/:id/notes/:noteId — remove a log entry
export const DELETE = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) => {
  try {
    const guard = await requirePageAccess("fee_petitions");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });
    }

    const { id, noteId } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }
    if (!noteId) {
      return NextResponse.json({ error: "Invalid note id" }, { status: 400 });
    }

    const [petition] = await db
      .select({ id: feePetitions.id })
      .from(feePetitions)
      .where(eq(feePetitions.caseId, caseId));
    if (!petition) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const [existing] = await db
      .select({ createdBy: activityLog.createdBy })
      .from(activityLog)
      .where(and(eq(activityLog.id, noteId), eq(activityLog.feePetitionId, petition.id)));
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    if (!canModifyNote(guard.session, existing.createdBy)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deleted = await db
      .delete(activityLog)
      .where(and(eq(activityLog.id, noteId), eq(activityLog.feePetitionId, petition.id)))
      .returning({ id: activityLog.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ status: "ok", id: noteId });
  } catch (error) {
    console.error("DELETE /api/fee-petitions/[id]/notes/[noteId] error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
};
