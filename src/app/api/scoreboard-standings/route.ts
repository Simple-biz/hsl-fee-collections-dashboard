import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_METRICS = new Set(["cases_closed", "fees_collected", "calls_logged"]);

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};

// GET /api/scoreboard-standings
//   ?week=YYYY-MM-DD            → Monday of a week (default: current week)
//   ?from=YYYY-MM-DD&to=...     → explicit date range (month view)
//   ?metric=cases_closed|fees_collected|calls_logged  (default: cases_closed)
//
// Restricted to admin, system_admin only.
export const GET = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const role = session.user.role;
    if (role !== "admin" && role !== "system_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get("week");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const metricParam = searchParams.get("metric") ?? "cases_closed";

    if (!VALID_METRICS.has(metricParam)) {
      return NextResponse.json({ error: "Invalid metric param" }, { status: 400 });
    }

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

    // Build the per-agent value subquery based on the requested metric.
    // cases_closed: Fee Petition team uses all-time approved petition count
    //   (no approved_at column exists), all others use closed_at window.
    // fees_collected: sum of the three per-type fee_received columns where
    //   the matching received_date falls in the window.
    // calls_logged: sum of daily_metrics call columns in the window.
    const valueExpr =
      metricParam === "fees_collected"
        ? sql`
            COALESCE((
              SELECT SUM(
                CASE WHEN fr.t16_fee_received_date >= ${startDate}::date
                          AND fr.t16_fee_received_date < ${endExclusive}::date
                     THEN COALESCE(fr.t16_fee_received::numeric, 0) ELSE 0 END
              + CASE WHEN fr.t2_fee_received_date >= ${startDate}::date
                          AND fr.t2_fee_received_date < ${endExclusive}::date
                     THEN COALESCE(fr.t2_fee_received::numeric, 0) ELSE 0 END
              + CASE WHEN fr.aux_fee_received_date >= ${startDate}::date
                          AND fr.aux_fee_received_date < ${endExclusive}::date
                     THEN COALESCE(fr.aux_fee_received::numeric, 0) ELSE 0 END
              )
              FROM fee_records fr
              WHERE fr.assigned_to = tm.name
            ), 0)`
        : metricParam === "calls_logged"
          ? sql`
            COALESCE((
              SELECT SUM(dm.ssa_calls + dm.client_calls_ib + dm.client_calls_ob)
              FROM daily_metrics dm
              WHERE dm.agent_name = tm.name
              AND dm.metric_date >= ${startDate}::date
              AND dm.metric_date < ${endExclusive}::date
            ), 0)`
          : // cases_closed (default)
            sql`
            CASE WHEN tm.team = 'Fee Petition' THEN
              (SELECT COUNT(*) FROM fee_petitions fp
               WHERE fp.assigned_to = tm.name
               AND fp.approved_at >= ${startDate}::date
               AND fp.approved_at < ${endExclusive}::date)
            ELSE
              (SELECT COUNT(*) FROM fee_records fr
               WHERE fr.assigned_to = tm.name
               AND fr.closed_at >= ${startDate}::date
               AND fr.closed_at < ${endExclusive}::date)
            END`;

    const rows = await db.execute(sql`
      SELECT
        tm.name AS agent,
        tm.team AS team,
        tm.role AS role,
        ${valueExpr} AS value
      FROM team_members tm
      WHERE tm.is_active = TRUE
      ORDER BY tm.team NULLS LAST, tm.name
    `);

    const agents = (rows as Record<string, string | number | null>[]).map((r) => ({
      agent: String(r.agent),
      team: r.team ? String(r.team) : null,
      role: r.role ? String(r.role) : null,
      value: Number(r.value),
    }));

    return NextResponse.json({ agents, metric: metricParam });
  } catch (err) {
    console.error("[scoreboard-standings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
