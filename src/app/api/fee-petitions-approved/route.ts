import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/fee-petitions-approved?week=YYYY-MM-DD
// Returns fee petitions approved (fee_petition_approved = TRUE) during a
// Mon-Sun week, grouped by the day their updated_at falls in that window
// (best available proxy — fee_petitions has no approved_at column).
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const week = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const rows = await db.execute(sql`
      SELECT
        fp.id::text AS id,
        fp.case_id AS case_id,
        c.first_name AS first_name,
        c.last_name AS last_name,
        c.external_id AS external_id,
        fp.assigned_to AS assigned_to,
        fp.updated_at AS updated_at
      FROM fee_petitions fp
      JOIN cases c ON c.client_id = fp.case_id
      WHERE fp.fee_petition_approved = TRUE
        AND fp.updated_at >= ${week}::date
        AND fp.updated_at < ${week}::date + INTERVAL '7 days'
      ORDER BY fp.updated_at ASC
    `) as unknown as {
      id: string;
      case_id: number;
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      assigned_to: string | null;
      updated_at: string;
    }[];

    const approvals = rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      caseName: `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
      externalId: r.external_id,
      assignedTo: r.assigned_to,
      approvedAt: r.updated_at,
      date: new Date(r.updated_at).toISOString().split("T")[0],
    }));

    const countByDate = new Map<string, number>();
    for (const a of approvals) {
      countByDate.set(a.date, (countByDate.get(a.date) ?? 0) + 1);
    }

    const monday = new Date(`${week}T00:00:00Z`);
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().split("T")[0];
      return { date, count: countByDate.get(date) ?? 0 };
    });

    return NextResponse.json({ week, data, approvals });
  } catch (error) {
    console.error("GET /api/fee-petitions-approved error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
