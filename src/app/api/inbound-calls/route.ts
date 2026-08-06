import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inboundCallRecords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { z } from "zod";
import { getMondayOfDate } from "@/lib/formatters";

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
    // Unrecognised values fall back to createdAt (safe — Drizzle column ref, not SQL string).
    const sortField = sortParam === "callDate" ? inboundCallRecords.callDate : inboundCallRecords.createdAt;

    const rows = await db
      .select()
      .from(inboundCallRecords)
      .where(eq(inboundCallRecords.weekStart, week))
      .orderBy(desc(sortField), desc(inboundCallRecords.id));

    const data = rows.map((r) => ({
      id: r.id,
      weekStart: r.weekStart,
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

// weekStart is intentionally absent — it is always derived from callDate so a
// record can never be filed under a week its date doesn't fall in. Extra keys
// are stripped by Zod, so callers still sending weekStart are unaffected.
const createSchema = z.object({
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

    const { callDate, number, transcript, caseLink, specialistAssigned, calledBackResolved } = parsed.data;

    const [row] = await db
      .insert(inboundCallRecords)
      .values({
        weekStart: getMondayOfDate(callDate),
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
      weekStart: row.weekStart,
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
