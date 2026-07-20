import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inboundCallRecords } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";

// GET /api/inbound-calls/backlog — all unresolved inbound calls, oldest first
export const GET = async () => {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const rows = await db
      .select()
      .from(inboundCallRecords)
      .where(eq(inboundCallRecords.calledBackResolved, false))
      .orderBy(asc(inboundCallRecords.callDate), asc(inboundCallRecords.id));

    const data = rows.map((r) => ({
      id: r.id,
      weekStart: r.weekStart,
      callDate: r.callDate,
      number: r.number ?? "",
      transcript: r.transcript ?? "",
      caseLink: r.caseLink ?? "",
      specialistAssigned: r.specialistAssigned ?? "",
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/inbound-calls/backlog error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
