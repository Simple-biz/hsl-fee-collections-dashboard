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

    // Calculate Monday of the target week (used as the default window).
    // Local getters, not toISOString() — this route only hits this branch
    // when no `week` param is supplied, and every current caller always
    // supplies one, but toISOString() would still be wrong by a day for a
    // server running outside UTC.
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

    // Fees collected within the window, from the actual payment ledger where
    // one exists. `fee_records.{type}_fee_received` is a running lifetime
    // total and `{type}_fee_received_date` is overwritten to the most recent
    // payment's date on every add (see /api/cases/[id]/payments), so neither
    // can be windowed directly for cases with more than one payment on the
    // same fee type — doing so would attribute the whole lifetime total to
    // one period and nothing to the others. Money that predates the
    // fee_payments ledger (bulk Sheets/MyCase sync, CSV import) has no
    // per-payment row at all, so it's treated as a single "legacy" payment
    // dated by the fee_records received-date column, sized as whatever part
    // of the lifetime total isn't already accounted for by real ledger rows.
    const teamTotals = await db.execute(sql`
      WITH payment_sums AS (
        SELECT case_id, fee_type, SUM(amount::numeric) AS paid_sum
        FROM fee_payments
        GROUP BY case_id, fee_type
      ),
      legacy_remainder AS (
        SELECT
          fr.case_id,
          fr.assigned_to,
          GREATEST(fr.t16_fee_received::numeric - COALESCE(p16.paid_sum, 0), 0) AS t16_remainder,
          fr.t16_fee_received_date,
          GREATEST(fr.t2_fee_received::numeric - COALESCE(p2.paid_sum, 0), 0) AS t2_remainder,
          fr.t2_fee_received_date,
          GREATEST(fr.aux_fee_received::numeric - COALESCE(pa.paid_sum, 0), 0) AS aux_remainder,
          fr.aux_fee_received_date
        FROM fee_records fr
        LEFT JOIN payment_sums p16 ON p16.case_id = fr.case_id AND p16.fee_type = 't16'
        LEFT JOIN payment_sums p2  ON p2.case_id  = fr.case_id AND p2.fee_type  = 't2'
        LEFT JOIN payment_sums pa  ON pa.case_id  = fr.case_id AND pa.fee_type  = 'aux'
      ),
      ledger_in_window AS (
        SELECT fr.assigned_to AS agent, fp.amount::numeric AS amt
        FROM fee_payments fp
        JOIN fee_records fr ON fr.case_id = fp.case_id
        WHERE fp.received_date >= ${startDate}::date AND fp.received_date < ${endExclusive}::date

        UNION ALL

        SELECT assigned_to AS agent, t16_remainder AS amt FROM legacy_remainder
        WHERE t16_fee_received_date >= ${startDate}::date AND t16_fee_received_date < ${endExclusive}::date
          AND t16_remainder > 0.005

        UNION ALL

        SELECT assigned_to AS agent, t2_remainder AS amt FROM legacy_remainder
        WHERE t2_fee_received_date >= ${startDate}::date AND t2_fee_received_date < ${endExclusive}::date
          AND t2_remainder > 0.005

        UNION ALL

        SELECT assigned_to AS agent, aux_remainder AS amt FROM legacy_remainder
        WHERE aux_fee_received_date >= ${startDate}::date AND aux_fee_received_date < ${endExclusive}::date
          AND aux_remainder > 0.005
      )
      SELECT
        tm.name AS agent,
        tm.team AS team,
        tm.role AS role,

        -- Cases assigned (current snapshot)
        (SELECT COUNT(*) FROM fee_records fr WHERE fr.assigned_to = tm.name) AS cases_assigned,

        -- Open cases (current snapshot)
        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.is_closed = FALSE) AS open_cases,

        -- Cases closed within the window
        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.closed_at >= ${startDate}::date
         AND fr.closed_at < ${endExclusive}::date) AS cases_closed,

        -- Completed win sheets (status = paid_in_full or closed, current snapshot)
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

        -- Unpaid T2 cases over 90 days
        (SELECT COUNT(*) FROM cases c
         JOIN fee_records fr ON fr.case_id = c.client_id
         WHERE fr.assigned_to = tm.name
         AND c.claim_type_label = 'T2'
         AND fr.t2_pending > 0
         AND c.approval_date IS NOT NULL
         AND c.approval_date < CURRENT_DATE - INTERVAL '90 days') AS unpaid_t2_over_90,

        -- Unpaid T16 cases over 90 days
        (SELECT COUNT(*) FROM cases c
         JOIN fee_records fr ON fr.case_id = c.client_id
         WHERE fr.assigned_to = tm.name
         AND c.claim_type_label = 'T16'
         AND fr.t16_pending > 0
         AND c.approval_date IS NOT NULL
         AND c.approval_date < CURRENT_DATE - INTERVAL '90 days') AS unpaid_t16_over_90,

        -- Unpaid concurrent cases over 90 days
        (SELECT COUNT(*) FROM cases c
         JOIN fee_records fr ON fr.case_id = c.client_id
         WHERE fr.assigned_to = tm.name
         AND c.claim_type_label = 'T2_T16'
         AND (fr.t2_pending > 0 OR fr.t16_pending > 0)
         AND c.approval_date IS NOT NULL
         AND c.approval_date < CURRENT_DATE - INTERVAL '90 days') AS unpaid_conc_over_90,

        -- Total fees collected (all time for this agent)
        COALESCE((SELECT SUM(fr.total_fees_paid::numeric) FROM fee_records fr WHERE fr.assigned_to = tm.name), 0) AS total_collected,

        -- Fees collected within the window (see ledger_in_window above)
        COALESCE((
          SELECT SUM(l.amt) FROM ledger_in_window l WHERE l.agent = tm.name
        ), 0) AS fees_collected_in_window,

        -- Cases with full fee collected (PIF)
        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.pif_ready_to_close = TRUE) AS cases_full_fee,

        -- Call and win sheet metrics from daily_metrics for the window
        COALESCE((SELECT SUM(dm.ssa_calls) FROM daily_metrics dm
         WHERE dm.agent_name = tm.name
         AND dm.metric_date >= ${startDate}::date
         AND dm.metric_date < ${endExclusive}::date), 0) AS week_ssa_calls,

        COALESCE((SELECT SUM(dm.client_calls_ib + dm.client_calls_ob) FROM daily_metrics dm
         WHERE dm.agent_name = tm.name
         AND dm.metric_date >= ${startDate}::date
         AND dm.metric_date < ${endExclusive}::date), 0)
        + COALESCE((SELECT COUNT(*) FROM inbound_call_records icr
         WHERE icr.specialist_assigned = tm.name
         AND icr.specialist_assigned IS NOT NULL
         AND icr.specialist_assigned != ''
         AND icr.call_date >= ${startDate}::date
         AND icr.call_date < ${endExclusive}::date), 0) AS week_client_calls,

        COALESCE((SELECT SUM(dm.win_sheets_created) FROM daily_metrics dm
         WHERE dm.agent_name = tm.name
         AND dm.metric_date >= ${startDate}::date
         AND dm.metric_date < ${endExclusive}::date), 0) AS week_win_sheets_created,

        COALESCE((SELECT SUM(dm.fax_sent) FROM daily_metrics dm
         WHERE dm.agent_name = tm.name
         AND dm.metric_date >= ${startDate}::date
         AND dm.metric_date < ${endExclusive}::date), 0) AS week_fax_sent,

        -- Open cases fees status per agent (current snapshot), bucketed by
        -- fees_confirmation alone so the three counts are mutually exclusive
        -- and always sum to that agent's total open cases.
        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.is_closed = FALSE
         AND (fr.fees_confirmation IS NULL OR fr.fees_confirmation IN ('', 'No'))
        )::int AS open_no_fees,

        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.is_closed = FALSE
         AND fr.fees_confirmation = 'Pending'
        )::int AS open_partial,

        (SELECT COUNT(*) FROM fee_records fr
         WHERE fr.assigned_to = tm.name
         AND fr.is_closed = FALSE
         AND fr.fees_confirmation = 'Yes'
        )::int AS open_pif

      FROM team_members tm
      WHERE tm.is_active = TRUE
      ORDER BY tm.team NULLS LAST, tm.name
    `);

    // Daily breakdown for the window (from daily_metrics)
    const dailyBreakdown = await db.execute(sql`
      SELECT
        dm.agent_name AS agent,
        dm.metric_date AS date,
        dm.ssa_calls,
        dm.client_calls_ib,
        dm.client_calls_ob,
        dm.win_sheets_created,
        dm.fax_sent,
        dm.notes
      FROM daily_metrics dm
      WHERE dm.metric_date >= ${startDate}::date
        AND dm.metric_date < ${endExclusive}::date
      ORDER BY dm.agent_name, dm.metric_date
    `);

    const agents = (teamTotals as Record<string, string | number | null>[]).map(
      (r) => ({
        agent: String(r.agent),
        team: r.team ? String(r.team) : null,
        role: r.role ? String(r.role) : null,
        casesAssigned: Number(r.cases_assigned),
        openCases: Number(r.open_cases),
        casesClosed: Number(r.cases_closed),
        completedWinSheets: Number(r.completed_win_sheets),
        winSheetsCreated: Number(r.week_win_sheets_created),
        unpaidT2Over60: Number(r.unpaid_t2_over_60),
        unpaidT16Over60: Number(r.unpaid_t16_over_60),
        unpaidConcOver60: Number(r.unpaid_conc_over_60),
        unpaidT2Over90: Number(r.unpaid_t2_over_90),
        unpaidT16Over90: Number(r.unpaid_t16_over_90),
        unpaidConcOver90: Number(r.unpaid_conc_over_90),
        totalCollected: Number(r.total_collected),
        feesCollectedInWindow: Number(r.fees_collected_in_window),
        casesFullFee: Number(r.cases_full_fee),
        weekSsaCalls: Number(r.week_ssa_calls),
        weekClientCalls: Number(r.week_client_calls),
        weekFaxSent: Number(r.week_fax_sent),
        openNoFees: Number(r.open_no_fees),
        openPartial: Number(r.open_partial),
        openPif: Number(r.open_pif),
      }),
    );

    // Overall summary (all agents)
    const summary = {
      totalCasesAssigned: agents.reduce((s, a) => s + a.casesAssigned, 0),
      totalOpenCases: agents.reduce((s, a) => s + a.openCases, 0),
      totalCasesClosed: agents.reduce((s, a) => s + a.casesClosed, 0),
      totalCompletedWinSheets: agents.reduce((s, a) => s + a.completedWinSheets, 0),
      totalWinSheetsCreated: agents.reduce((s, a) => s + a.winSheetsCreated, 0),
      totalUnpaidT2Over60: agents.reduce((s, a) => s + a.unpaidT2Over60, 0),
      totalUnpaidT16Over60: agents.reduce((s, a) => s + a.unpaidT16Over60, 0),
      totalUnpaidConcOver60: agents.reduce((s, a) => s + a.unpaidConcOver60, 0),
      totalUnpaidT2Over90: agents.reduce((s, a) => s + a.unpaidT2Over90, 0),
      totalUnpaidT16Over90: agents.reduce((s, a) => s + a.unpaidT16Over90, 0),
      totalUnpaidConcOver90: agents.reduce((s, a) => s + a.unpaidConcOver90, 0),
      totalCollected: agents.reduce((s, a) => s + a.totalCollected, 0),
      totalFeesCollectedInWindow: agents.reduce((s, a) => s + a.feesCollectedInWindow, 0),
      totalCasesFullFee: agents.reduce((s, a) => s + a.casesFullFee, 0),
      totalSsaCalls: agents.reduce((s, a) => s + a.weekSsaCalls, 0),
      totalClientCalls: agents.reduce((s, a) => s + a.weekClientCalls, 0),
    };

    // Team-level aggregation — group agents by team, exclude unassigned
    const TEAM_ORDER = ["T2", "T16", "Concurrent"];
    const teamMap = new Map<string, typeof agents>();
    for (const a of agents) {
      if (!a.team) continue;
      const bucket = teamMap.get(a.team) ?? [];
      bucket.push(a);
      teamMap.set(a.team, bucket);
    }
    const teams = TEAM_ORDER.filter((t) => teamMap.has(t)).map((teamName) => {
      const members = teamMap.get(teamName)!;
      return {
        team: teamName,
        agentCount: members.length,
        casesAssigned: members.reduce((s, a) => s + a.casesAssigned, 0),
        openCases: members.reduce((s, a) => s + a.openCases, 0),
        casesClosed: members.reduce((s, a) => s + a.casesClosed, 0),
        completedWinSheets: members.reduce((s, a) => s + a.completedWinSheets, 0),
        winSheetsCreated: members.reduce((s, a) => s + a.winSheetsCreated, 0),
        unpaidT2Over60: members.reduce((s, a) => s + a.unpaidT2Over60, 0),
        unpaidT16Over60: members.reduce((s, a) => s + a.unpaidT16Over60, 0),
        unpaidConcOver60: members.reduce((s, a) => s + a.unpaidConcOver60, 0),
        totalCollected: members.reduce((s, a) => s + a.totalCollected, 0),
        feesCollectedInWindow: members.reduce((s, a) => s + a.feesCollectedInWindow, 0),
        casesFullFee: members.reduce((s, a) => s + a.casesFullFee, 0),
        ssaCalls: members.reduce((s, a) => s + a.weekSsaCalls, 0),
        clientCalls: members.reduce((s, a) => s + a.weekClientCalls, 0),
      };
    });

    const daily = (dailyBreakdown as Record<string, string | number>[]).map(
      (r) => ({
        agent: String(r.agent),
        date: String(r.date),
        ssaCalls: Number(r.ssa_calls),
        clientCallsIb: Number(r.client_calls_ib),
        clientCallsOb: Number(r.client_calls_ob),
        winSheetsCreated: Number(r.win_sheets_created),
        faxSent: Number(r.fax_sent),
        notes: r.notes ? String(r.notes) : null,
      }),
    );

    // "No fees" = zero dollars received — same predicate as the "Unpaid
    // >60d/>90d" aging filter on the Master Fees page, which the team
    // validated as the accurate definition. Kept identical to the aging
    // query below so this card and the aging buckets can never disagree
    // (the buckets are always a subset of this total).
    const [feesStatus] = await db.execute(sql`
      SELECT COUNT(*) FILTER (
        WHERE COALESCE(total_fees_paid, 0) = 0
      )::int AS no_fees_count
      FROM fee_records
      WHERE is_closed = false
    `) as unknown as [{ no_fees_count: number }];

    const openCasesFeesStatus = {
      noFees: Number(feesStatus?.no_fees_count) || 0,
    };

    // No Fees Cases aging — same predicate as openCasesFeesStatus.noFees
    // above (zero dollars received), aged over 60 days by approval_date.
    const noFeesCaseRows = await db.execute(sql`
      SELECT
        c.client_id AS id,
        c.first_name AS first_name,
        c.last_name AS last_name,
        c.external_id AS external_id,
        fr.assigned_to AS assigned,
        c.claim_type_label AS claim_type_label,
        c.approval_date AS approval_date,
        (CURRENT_DATE - c.approval_date)::int AS days_since_approval
      FROM fee_records fr
      JOIN cases c ON c.client_id = fr.case_id
      WHERE fr.is_closed = FALSE
        AND COALESCE(fr.total_fees_paid, 0) = 0
        AND c.approval_date IS NOT NULL
        AND c.approval_date < CURRENT_DATE - INTERVAL '60 days'
      ORDER BY c.approval_date ASC
    `) as unknown as {
      id: number;
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      assigned: string | null;
      claim_type_label: string | null;
      approval_date: string | null;
      days_since_approval: number;
    }[];

    const noFeesCases = noFeesCaseRows.map((r) => ({
      id: r.id,
      name: `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
      externalId: r.external_id,
      assigned: r.assigned || "—",
      claim: r.claim_type_label === "T2_T16" || r.claim_type_label === "CONCURRENT" ? "CONC" : r.claim_type_label || "—",
      approvalDate: r.approval_date,
      daysSinceApproval: Number(r.days_since_approval) || 0,
    }));

    // Mutually exclusive buckets — a case over 90 days counts only in the
    // 90-day bucket, not in both, so the two numbers can be added together
    // without double-counting.
    const noFeesAging = {
      over60: noFeesCases.filter((c) => c.daysSinceApproval > 60 && c.daysSinceApproval <= 90).length,
      over90: noFeesCases.filter((c) => c.daysSinceApproval > 90).length,
    };

    return NextResponse.json({
      week: monday,
      start: startDate,
      end: useRange ? toParam : addDays(monday, 6),
      summary,
      agents,
      teams,
      daily,
      openCasesFeesStatus,
      noFeesAging,
      noFeesCases,
    });
  } catch (error) {
    console.error("GET /api/scoreboard error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
