import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { requireCapability, guardStatus } from "@/lib/auth-helpers";

// GET /api/cases/:id/notes — activity log entries for a case (clientId)
export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }

    const entries = await db
      .select({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
        editedAt: activityLog.editedAt,
      })
      .from(activityLog)
      .where(eq(activityLog.caseId, caseId))
      .orderBy(desc(activityLog.createdAt));

    return NextResponse.json({ data: entries });
  } catch (error) {
    console.error("GET /api/cases/[id]/notes error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

const createNoteSchema = z.object({
  message: z.string().trim().min(1, "Note can't be empty"),
});

// POST /api/cases/:id/notes — add a note (gated by case.update). Author is
// stamped from the signed-in user so the history shows who wrote it.
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const guard = await requireCapability("case.update");
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
      .insert(activityLog)
      .values({ caseId, message: parsed.data.message, createdBy: author })
      .returning({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
      });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cases/[id]/notes error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
