import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { requireCapability, guardStatus, sessionHasCapability } from "@/lib/auth-helpers";

// A note can be edited/deleted by its own author, or by anyone with the
// case.delete override (admins by default) — mirrors the "self or this
// capability" pattern documented on sessionHasCapability.
const canModifyNote = (session: Session, createdBy: string | null) => {
  const author = session.user?.name?.trim();
  return (!!author && author === createdBy) || sessionHasCapability(session, "case.delete");
};

// PATCH /api/cases/:id/notes/:noteId — edit a note's message. Gated by
// case.update (same baseline as posting a note); the actual write is only
// allowed for the note's own author or an admin override.
const editNoteSchema = z.object({
  message: z.string().trim().min(1, "Note can't be empty"),
});

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) => {
  try {
    const guard = await requireCapability("case.update");
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

    const parsed = editNoteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const [existing] = await db
      .select({ createdBy: activityLog.createdBy })
      .from(activityLog)
      .where(and(eq(activityLog.id, noteId), eq(activityLog.caseId, caseId)));

    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    if (!canModifyNote(guard.session, existing.createdBy)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [updated] = await db
      .update(activityLog)
      .set({ message: parsed.data.message, editedAt: new Date() })
      .where(and(eq(activityLog.id, noteId), eq(activityLog.caseId, caseId)))
      .returning({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
        editedAt: activityLog.editedAt,
      });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/cases/[id]/notes/[noteId] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// DELETE /api/cases/:id/notes/:noteId — remove a single note (activity_log
// entry). Allowed for the note's own author or an admin override (case.delete).
// The delete is scoped to the case id so a note can't be removed via the wrong
// case route.
export const DELETE = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) => {
  try {
    const guard = await requireCapability("case.update");
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

    const [existing] = await db
      .select({ createdBy: activityLog.createdBy })
      .from(activityLog)
      .where(and(eq(activityLog.id, noteId), eq(activityLog.caseId, caseId)));

    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    if (!canModifyNote(guard.session, existing.createdBy)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
