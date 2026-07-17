import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/cases-closed?week=YYYY-MM-DD
// Returns cases closed (fee_records.closed_at) during a Mon-Sun week,
// grouped by the day they were closed.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const week = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const rows = await db.execute(sql`
      SELECT
        fr.id::text AS id,
        c.first_name AS first_name,
        c.last_name AS last_name,
        c.external_id AS external_id,
        fr.assigned_to AS assigned_to,
        fr.closed_at::date AS closed_date
      FROM fee_records fr
      JOIN cases c ON c.client_id = fr.case_id
      WHERE fr.is_closed = TRUE
        AND fr.closed_at IS NOT NULL
        AND fr.closed_at >= ${week}::date
        AND fr.closed_at < ${week}::date + INTERVAL '7 days'
      ORDER BY fr.closed_at ASC
    `) as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      assigned_to: string | null;
      closed_date: string;
    }[];

    const closures = rows.map((r) => ({
      id: r.id,
      caseName: `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
      externalId: r.external_id,
      assignedTo: r.assigned_to,
      date: String(r.closed_date),
    }));

    const countByDate = new Map<string, number>();
    for (const r of rows) {
      const d = String(r.closed_date);
      countByDate.set(d, (countByDate.get(d) ?? 0) + 1);
    }

    const monday = new Date(`${week}T00:00:00Z`);
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().split("T")[0];
      return { date, count: countByDate.get(date) ?? 0 };
    });

    return NextResponse.json({ week, data, closures });
  } catch (error) {
    console.error("GET /api/cases-closed error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
