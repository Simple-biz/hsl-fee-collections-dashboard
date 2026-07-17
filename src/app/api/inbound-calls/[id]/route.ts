import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inboundCallRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { z } from "zod";

const resolveId = async (context: {
  params: { id: string } | Promise<{ id: string }>;
}) => {
  const p = context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.id);
};

const patchSchema = z.object({
  callDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  number: z.string().max(50).nullable().optional(),
  transcript: z.string().nullable().optional(),
  caseLink: z.string().max(500).nullable().optional(),
  specialistAssigned: z.string().max(200).nullable().optional(),
  calledBackResolved: z.boolean().optional(),
});

// PATCH /api/inbound-calls/[id] — anyone authenticated
export const PATCH = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const id = await resolveId(context);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }

    const updates: Record<string, unknown> = { ...parsed.data };
    updates.updatedAt = sql`now()`;

    const [row] = await db
      .update(inboundCallRecords)
      .set(updates)
      .where(eq(inboundCallRecords.id, id))
      .returning();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id: row.id,
      callDate: row.callDate,
      createdAt: row.createdAt.toISOString(),
      number: row.number ?? "",
      transcript: row.transcript ?? "",
      caseLink: row.caseLink ?? "",
      specialistAssigned: row.specialistAssigned ?? "",
      calledBackResolved: row.calledBackResolved,
    });
  } catch (err) {
    console.error("PATCH /api/inbound-calls/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

// DELETE /api/inbound-calls/[id] — anyone authenticated
export const DELETE = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const id = await resolveId(context);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    await db.delete(inboundCallRecords).where(eq(inboundCallRecords.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/inbound-calls/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
