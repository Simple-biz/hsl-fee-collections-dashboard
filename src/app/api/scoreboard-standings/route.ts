import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};

// GET /api/scoreboard-standings
//   ?week=YYYY-MM-DD          → Monday of a week (default: current week)
//   ?from=YYYY-MM-DD&to=...   → explicit date range (month view)
//
// Restricted to lead, admin, system_admin — not member-accessible.
// Returns only the per-agent casesClosed counts needed for the Standings tab
// in Notifications; intentionally a subset of /api/scoreboard so the member-
// accessible Scoreboard page is not affected by this access restriction.
export const GET = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const role = session.user.role;
    if (role !== "lead" && role !== "admin" && role !== "system_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get("week");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (weekParam && !ISO_DATE_RE.test(weekParam)) {
      return NextResponse.json({ error: "Invalid week param" }, { status: 400 });
    }

    let monday: string;
    if (weekParam) {
      monday = weekParam;
    } else {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      monday = `${y}-${m}-${dd}`;
    }

    const useRange =
      fromParam != null &&
      toParam != null &&
      ISO_DATE_RE.test(fromParam) &&
      ISO_DATE_RE.test(toParam) &&
      fromParam <= toParam;
    if ((fromParam || toParam) && !useRange) {
      return NextResponse.json({ error: "Invalid from/to range" }, { status: 400 });
    }
    const startDate = useRange ? fromParam! : monday;
    const endExclusive = useRange ? addDays(toParam!, 1) : addDays(monday, 7);

    const rows = await db.execute(sql`
      SELECT
        tm.name  AS agent,
        tm.team  AS team,
        tm.role  AS role,
        -- Fee Petition specialists: all-time count of approved petitions —
        -- no approved_at column exists on fee_petitions so the count is not
        -- date-windowed. All other agents: count closed fee_records in window.
        CASE WHEN tm.team = 'Fee Petition' THEN
          (SELECT COUNT(*) FROM fee_petitions fp
           WHERE fp.assigned_to = tm.name
           AND fp.fee_petition_approved = TRUE)
        ELSE
          (SELECT COUNT(*) FROM fee_records fr
           WHERE fr.assigned_to = tm.name
           AND fr.closed_at >= ${startDate}::date
           AND fr.closed_at < ${endExclusive}::date)
        END AS cases_closed
      FROM team_members tm
      WHERE tm.is_active = TRUE
      ORDER BY tm.team NULLS LAST, tm.name
    `);

    const agents = (rows as Record<string, string | number | null>[]).map((r) => ({
      agent: String(r.agent),
      team: r.team ? String(r.team) : null,
      role: r.role ? String(r.role) : null,
      casesClosed: Number(r.cases_closed),
    }));

    return NextResponse.json({ agents });
  } catch (err) {
    console.error("[scoreboard-standings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
