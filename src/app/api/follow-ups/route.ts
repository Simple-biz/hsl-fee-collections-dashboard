import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/follow-ups?week=YYYY-MM-DD
// Returns follow-ups due during a Mon–Sun week from both fee_records and
// fee_petitions, with per-agent counts and a flat case list.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const week = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const rows = await db.execute(sql`
      SELECT
        'fr_' || fr.id::text                   AS id,
        c.client_id,
        c.first_name,
        c.last_name,
        c.external_id,
        fr.assigned_to,
        fr.next_follow_up_date::text            AS follow_up_date,
        'master_fees'                           AS source
      FROM fee_records fr
      JOIN cases c ON c.client_id = fr.case_id
      WHERE fr.next_follow_up_date >= ${week}::date
        AND fr.next_follow_up_date <  ${week}::date + INTERVAL '7 days'
        AND COALESCE(fr.is_closed, false) = false

      UNION ALL

      SELECT
        'fp_' || fp.id::text                   AS id,
        c.client_id,
        c.first_name,
        c.last_name,
        c.external_id,
        fp.assigned_to,
        fp.next_follow_up_date::text            AS follow_up_date,
        'fee_petition'                          AS source
      FROM fee_petitions fp
      JOIN cases c ON c.client_id = fp.case_id
      WHERE fp.next_follow_up_date >= ${week}::date
        AND fp.next_follow_up_date <  ${week}::date + INTERVAL '7 days'

      ORDER BY follow_up_date ASC, last_name ASC
    `) as unknown as {
      id: string;
      client_id: number | string;
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      assigned_to: string | null;
      follow_up_date: string;
      source: string;
    }[];

    const followUps = rows.map((r) => ({
      id: r.id,
      caseId: Number(r.client_id),
      caseName: `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
      externalId: r.external_id,
      assignedTo: r.assigned_to,
      date: r.follow_up_date,
      source: r.source as "master_fees" | "fee_petition",
    }));

    // Per-day counts (Mon–Sun of the requested week)
    const countByDate = new Map<string, number>();
    for (const r of rows) countByDate.set(r.follow_up_date, (countByDate.get(r.follow_up_date) ?? 0) + 1);
    const monday = new Date(`${week}T00:00:00Z`);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().split("T")[0];
      return { date, count: countByDate.get(date) ?? 0 };
    });

    // Per-agent counts (kept for the detail list)
    const agentMap = new Map<string, number>();
    for (const r of rows) {
      const name = r.assigned_to ?? "Unassigned";
      agentMap.set(name, (agentMap.get(name) ?? 0) + 1);
    }
    const agents = Array.from(agentMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return NextResponse.json({ days, agents, followUps });
  } catch (error) {
    console.error("GET /api/follow-ups error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
