import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inboundCallPoc } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, guardStatus } from "@/lib/auth-helpers";
import { auth } from "@/auth";
import { z } from "zod";

// GET /api/inbound-calls/poc?week=YYYY-MM-DD
// Returns { assignments: Record<1|2|3|4|5, string[]> }
export const GET = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const week = new URL(req.url).searchParams.get("week");
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
      return NextResponse.json({ error: "week param required (YYYY-MM-DD)" }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(inboundCallPoc)
      .where(eq(inboundCallPoc.weekStart, week));

    const assignments: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const r of rows) {
      if (r.dayOfWeek >= 1 && r.dayOfWeek <= 5) {
        assignments[r.dayOfWeek].push(r.pocName);
      }
    }

    return NextResponse.json({ assignments });
  } catch (err) {
    console.error("GET /api/inbound-calls/poc error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

const putSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // dayOfWeek (1-5) -> array of poc names
  assignments: z.record(z.string(), z.array(z.string().max(200))),
});

// PUT /api/inbound-calls/poc — admin only; replaces all assignments for the week
export const PUT = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });

    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }

    const { weekStart, assignments } = parsed.data;

    await db.delete(inboundCallPoc).where(eq(inboundCallPoc.weekStart, weekStart));

    const rows = Object.entries(assignments).flatMap(([dayStr, names]) => {
      const day = parseInt(dayStr);
      if (isNaN(day) || day < 1 || day > 5) return [];
      return names.map((name) => ({
        weekStart,
        dayOfWeek: day,
        pocName: name,
      }));
    });

    if (rows.length > 0) {
      await db.insert(inboundCallPoc).values(rows);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/inbound-calls/poc error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
