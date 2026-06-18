import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Add days to a YYYY-MM-DD (UTC math, returns YYYY-MM-DD) — used for the
// exclusive upper bound of the call-aggregation window.
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
};

// GET /api/scoreboard
//   ?week=YYYY-MM-DD          → Monday of a week (default: current week)
//   ?from=YYYY-MM-DD&to=...   → explicit date range (month/range views)
// Only the CALL metrics (SSA / client calls) are windowed by date — case
// metrics are current-state snapshots and ignore the window.
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = searchParams.get("week");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // Calculate Monday of the target week (used as the default window)
    const now = new Date();
    let monday: string;
    if (weekParam) {
      monday = weekParam;
    } else {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      d.setDate(diff);
      monday = d.toISOString().split("T")[0];
    }

    // Resolve the call-aggregation window: explicit range when both from/to
    // are valid, otherwise the 7-day week starting Monday.
    const useRange =
      fromParam != null &&
      toParam != null &&
      ISO_DATE_RE.test(fromParam) &&
      ISO_DATE_RE.test(toParam) &&
      fromParam <= toParam;
    if ((fromParam || toParam) && !useRange) {
      return NextResponse.json(
        { error: "Invalid from/to range" },
        { status: 400 },
      );
    }
    const startDate = useRange ? fromParam! : monday;
    const endExclusive = useRange ? addDays(toParam!, 1) : addDays(monday, 7);

    // Team-wide totals for the week
    const teamTotals = await db.execute(sql`
      SELECT
        tm.name AS agent,
        -- Cases assigned (current snapshot)
        (SELECT COUNT(*) FROM fee_records fr WHERE fr.assigned_to = tm.name) AS cases_assigned,

        -- Completed win sheets (status = paid_in_full or closed)
        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.win_sheet_status IN ('paid_in_full', 'closed')) AS completed_win_sheets,

        -- Unpaid T2 cases over 60 days
        (SELECT COUNT(*) FROM cases c
         JOIN fee_records fr ON fr.case_id = c.client_id
         WHERE fr.assigned_to = tm.name
         AND c.claim_type_label = 'T2'
         AND fr.t2_pending > 0
         AND c.approval_date IS NOT NULL
         AND c.approval_date < CURRENT_DATE - INTERVAL '60 days') AS unpaid_t2_over_60,

        -- Unpaid T16 cases over 60 days
        (SELECT COUNT(*) FROM cases c
         JOIN fee_records fr ON fr.case_id = c.client_id
         WHERE fr.assigned_to = tm.name
         AND c.claim_type_label = 'T16'
         AND fr.t16_pending > 0
         AND c.approval_date IS NOT NULL
         AND c.approval_date < CURRENT_DATE - INTERVAL '60 days') AS unpaid_t16_over_60,

        -- Unpaid concurrent cases over 60 days
        (SELECT COUNT(*) FROM cases c
         JOIN fee_records fr ON fr.case_id = c.client_id
         WHERE fr.assigned_to = tm.name
         AND c.claim_type_label = 'T2_T16'
         AND (fr.t2_pending > 0 OR fr.t16_pending > 0)
         AND c.approval_date IS NOT NULL
         AND c.approval_date < CURRENT_DATE - INTERVAL '60 days') AS unpaid_conc_over_60,

        -- Total fees collected (all time for this agent)
        COALESCE((SELECT SUM(fr.total_fees_paid::numeric) FROM fee_records fr WHERE fr.assigned_to = tm.name), 0) AS total_collected,

        -- Cases with full fee collected (PIF)
        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.pif_ready_to_close = TRUE) AS cases_full_fee,

        -- Daily metrics from daily_metrics table for the week
        COALESCE((SELECT SUM(dm.ssa_calls) FROM daily_metrics dm
         WHERE dm.agent_name = tm.name
         AND dm.metric_date >= ${startDate}::date
         AND dm.metric_date < ${endExclusive}::date), 0) AS week_ssa_calls,

        COALESCE((SELECT SUM(dm.client_calls_ib + dm.client_calls_ob) FROM daily_metrics dm
         WHERE dm.agent_name = tm.name
         AND dm.metric_date >= ${startDate}::date
         AND dm.metric_date < ${endExclusive}::date), 0) AS week_client_calls

      FROM team_members tm
      WHERE tm.is_active = TRUE
      ORDER BY tm.name
    `);

    // Fees collected by claim type (all-time team snapshot)
    const teamFeesResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN c.claim_type_label = 'T2' THEN fr.total_fees_paid::numeric ELSE 0 END), 0) AS t2_collected,
        COALESCE(SUM(CASE WHEN c.claim_type_label = 'T16' THEN fr.total_fees_paid::numeric ELSE 0 END), 0) AS t16_collected,
        COALESCE(SUM(CASE WHEN c.claim_type_label IN ('T2_T16', 'T2/T16') THEN fr.total_fees_paid::numeric ELSE 0 END), 0) AS conc_collected
      FROM fee_records fr
      JOIN cases c ON c.client_id = fr.case_id
    `);
    const teamFeesRow =
      (teamFeesResult as Record<string, string | number>[])[0] ?? {};
    const teamFees = {
      t2: Number(teamFeesRow.t2_collected ?? 0),
      t16: Number(teamFeesRow.t16_collected ?? 0),
      conc: Number(teamFeesRow.conc_collected ?? 0),
    };

    // Daily breakdown for the week (from daily_metrics)
    const dailyBreakdown = await db.execute(sql`
      SELECT
        dm.agent_name AS agent,
        dm.metric_date AS date,
        dm.ssa_calls,
        dm.client_calls_ib,
        dm.client_calls_ob,
        dm.notes
      FROM daily_metrics dm
      WHERE dm.metric_date >= ${startDate}::date
        AND dm.metric_date < ${endExclusive}::date
      ORDER BY dm.agent_name, dm.metric_date
    `);

    // Compute team-wide summary
    const agents = (teamTotals as Record<string, string | number>[]).map(
      (r) => ({
        agent: String(r.agent),
        casesAssigned: Number(r.cases_assigned),
        completedWinSheets: Number(r.completed_win_sheets),
        unpaidT2Over60: Number(r.unpaid_t2_over_60),
        unpaidT16Over60: Number(r.unpaid_t16_over_60),
        unpaidConcOver60: Number(r.unpaid_conc_over_60),
        totalCollected: Number(r.total_collected),
        casesFullFee: Number(r.cases_full_fee),
        weekSsaCalls: Number(r.week_ssa_calls),
        weekClientCalls: Number(r.week_client_calls),
      }),
    );

    const summary = {
      totalCasesAssigned: agents.reduce((s, a) => s + a.casesAssigned, 0),
      totalCompletedWinSheets: agents.reduce(
        (s, a) => s + a.completedWinSheets,
        0,
      ),
      totalUnpaidT2Over60: agents.reduce((s, a) => s + a.unpaidT2Over60, 0),
      totalUnpaidT16Over60: agents.reduce((s, a) => s + a.unpaidT16Over60, 0),
      totalUnpaidConcOver60: agents.reduce((s, a) => s + a.unpaidConcOver60, 0),
      totalCollected: agents.reduce((s, a) => s + a.totalCollected, 0),
      totalCasesFullFee: agents.reduce((s, a) => s + a.casesFullFee, 0),
      totalSsaCalls: agents.reduce((s, a) => s + a.weekSsaCalls, 0),
      totalClientCalls: agents.reduce((s, a) => s + a.weekClientCalls, 0),
    };

    const daily = (dailyBreakdown as Record<string, string | number>[]).map(
      (r) => ({
        agent: String(r.agent),
        date: String(r.date),
        ssaCalls: Number(r.ssa_calls),
        clientCallsIb: Number(r.client_calls_ib),
        clientCallsOb: Number(r.client_calls_ob),
        notes: r.notes ? String(r.notes) : null,
      }),
    );

    return NextResponse.json({
      week: monday,
      start: startDate,
      end: useRange ? toParam : addDays(monday, 6),
      summary,
      agents,
      daily,
      teamFees,
    });
  } catch (error) {
    console.error("GET /api/scoreboard error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
