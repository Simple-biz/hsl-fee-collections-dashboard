import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, cases, feePetitions } from "@/lib/db/schema";
import { requirePageAccess, guardStatus } from "@/lib/auth-helpers";

// GET /api/fee-petitions/:id/notes — log entries for a fee petition (scoped by
// feePetitionId so they stay separate from the case's general activity log)
export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const guard = await requirePageAccess("fee_petitions");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });
    }

    const { id } = await params;
    const caseId = Number(id);
    if (!Number.isFinite(caseId)) {
      return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
    }

    const [petition] = await db
      .select({ id: feePetitions.id })
      .from(feePetitions)
      .where(eq(feePetitions.caseId, caseId));

    if (!petition) {
      return NextResponse.json({ data: [], total: 0 });
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
      .where(eq(activityLog.feePetitionId, petition.id))
      .orderBy(desc(activityLog.createdAt));

    return NextResponse.json({ data: entries, total: entries.length });
  } catch (error) {
    console.error("GET /api/fee-petitions/[id]/notes error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
};

const createNoteSchema = z.object({
  message: z.string().trim().min(1, "Note can't be empty"),
});

// POST /api/fee-petitions/:id/notes — add a log entry. Creates the
// fee_petitions row if it doesn't exist yet (untouched case). Author is
// stamped from the signed-in user.
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const guard = await requirePageAccess("fee_petitions");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });
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

    // Verify the case exists before touching fee_petitions — avoids a FK
    // constraint 500 when an invalid caseId is passed.
    const [caseRow] = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.clientId, caseId));
    if (!caseRow) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Look up existing petition row, or create a minimal one if never touched
    let [petition] = await db
      .select({ id: feePetitions.id })
      .from(feePetitions)
      .where(eq(feePetitions.caseId, caseId));

    if (!petition) {
      const [created] = await db
        .insert(feePetitions)
        .values({ caseId })
        .returning({ id: feePetitions.id });
      petition = created;
    }

    const author = guard.session.user?.name?.trim() || "Unknown";
    const [entry] = await db
      .insert(activityLog)
      .values({
        caseId,
        feePetitionId: petition.id,
        message: parsed.data.message,
        createdBy: author,
      })
      .returning({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
      });

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error("POST /api/fee-petitions/[id]/notes error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
};
