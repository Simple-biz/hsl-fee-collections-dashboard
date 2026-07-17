import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inboundCallRecords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { z } from "zod";

// GET /api/inbound-calls?week=YYYY-MM-DD&sort=createdAt|callDate
export const GET = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const week = searchParams.get("week");
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      return NextResponse.json({ error: "week param required (YYYY-MM-DD)" }, { status: 400 });
    }
    const sortParam = searchParams.get("sort");
    const sortField = sortParam === "callDate" ? inboundCallRecords.callDate : inboundCallRecords.createdAt;

    const rows = await db
      .select()
      .from(inboundCallRecords)
      .where(eq(inboundCallRecords.weekStart, week))
      .orderBy(desc(sortField), desc(inboundCallRecords.id));

    const data = rows.map((r) => ({
      id: r.id,
      callDate: r.callDate,
      createdAt: r.createdAt.toISOString(),
      number: r.number ?? "",
      transcript: r.transcript ?? "",
      caseLink: r.caseLink ?? "",
      specialistAssigned: r.specialistAssigned ?? "",
      calledBackResolved: r.calledBackResolved,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/inbound-calls error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

const createSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  callDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  number: z.string().max(50).optional(),
  transcript: z.string().optional(),
  caseLink: z.string().max(500).optional(),
  specialistAssigned: z.string().max(200).optional(),
  calledBackResolved: z.boolean().optional(),
});

// POST /api/inbound-calls — anyone authenticated
export const POST = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }

    const { weekStart, callDate, number, transcript, caseLink, specialistAssigned, calledBackResolved } = parsed.data;

    const [row] = await db
      .insert(inboundCallRecords)
      .values({
        weekStart,
        callDate,
        number: number ?? null,
        transcript: transcript ?? null,
        caseLink: caseLink ?? null,
        specialistAssigned: specialistAssigned ?? null,
        calledBackResolved: calledBackResolved ?? false,
      })
      .returning();

    return NextResponse.json({
      id: row.id,
      callDate: row.callDate,
      createdAt: row.createdAt.toISOString(),
      number: row.number ?? "",
      transcript: row.transcript ?? "",
      caseLink: row.caseLink ?? "",
      specialistAssigned: row.specialistAssigned ?? "",
      calledBackResolved: row.calledBackResolved,
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/inbound-calls error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
