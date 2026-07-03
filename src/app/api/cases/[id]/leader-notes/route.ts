import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaderNotes } from "@/lib/db/schema";
import { requireCapability, guardStatus } from "@/lib/auth-helpers";

// GET /api/cases/:id/leader-notes — a separate, quieter notes thread gated
// to leaderNotes.access (lead/admin by default) so it never mixes with the
// general Notes thread's auto-generated field-change noise, and members
// can't see it at all.
export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const guard = await requireCapability("leaderNotes.access");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const { id } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }

    const entries = await db
      .select({
        id: leaderNotes.id,
        message: leaderNotes.message,
        createdBy: leaderNotes.createdBy,
        createdAt: leaderNotes.createdAt,
      })
      .from(leaderNotes)
      .where(eq(leaderNotes.caseId, caseId))
      .orderBy(desc(leaderNotes.createdAt));

    return NextResponse.json({ data: entries });
  } catch (error) {
    console.error("GET /api/cases/[id]/leader-notes error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

const createNoteSchema = z.object({
  message: z.string().trim().min(1, "Note can't be empty"),
});

// POST /api/cases/:id/leader-notes — add a leader note, gated by
// leaderNotes.access. Author is stamped from the signed-in user.
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const guard = await requireCapability("leaderNotes.access");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const { id } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }

    const parsed = createNoteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const author = guard.session.user?.name?.trim() || "Unknown";
    const [entry] = await db
      .insert(leaderNotes)
      .values({ caseId, message: parsed.data.message, createdBy: author })
      .returning({
        id: leaderNotes.id,
        message: leaderNotes.message,
        createdBy: leaderNotes.createdBy,
        createdAt: leaderNotes.createdAt,
      });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cases/[id]/leader-notes error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
