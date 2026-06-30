import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/cases-added?week=YYYY-MM-DD
// Returns the actual cases whose `created_at` falls within that Mon-Sun week
// — i.e. new cases added to this database, regardless of import source
// (manual add, Sheets sync, MyCase sync, CSV import). Synced cases use
// onConflictDoNothing on re-sync, so created_at reliably reflects first-insert
// day, not the most recent sync. `data` (per-day counts, zero-filled for all
// 7 days) is derived from the same `cases` list returned below, so the count
// and the name list can never disagree.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const week = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const caseRows = await db.execute(sql`
      SELECT
        c.client_id AS id,
        c.first_name AS first_name,
        c.last_name AS last_name,
        c.external_id AS external_id,
        c.created_at AS created_at
      FROM cases c
      WHERE c.created_at >= ${week}::date
        AND c.created_at < ${week}::date + INTERVAL '7 days'
      ORDER BY c.created_at ASC
    `) as unknown as {
      id: number;
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      created_at: string;
    }[];

    const cases = caseRows.map((r) => ({
      id: r.id,
      name: `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
      externalId: r.external_id,
      createdAt: r.created_at,
      date: new Date(r.created_at).toISOString().split("T")[0],
    }));

    const countByDate = new Map<string, number>();
    for (const c of cases) countByDate.set(c.date, (countByDate.get(c.date) ?? 0) + 1);

    const monday = new Date(`${week}T00:00:00Z`);
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().split("T")[0];
      return { date, count: countByDate.get(date) ?? 0 };
    });

    return NextResponse.json({ week, data, cases });
  } catch (error) {
    console.error("GET /api/cases-added error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
