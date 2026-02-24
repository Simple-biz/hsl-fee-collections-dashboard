import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/reports?from=2026-02-17&to=2026-02-24
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params required" },
        { status: 400 },
      );
    }

    // 1. Agent call metrics aggregated for date range
    const callMetrics = await db.execute(sql`
      SELECT
        dm.agent_name,
        SUM(dm.ssa_calls)::int AS ssa_calls,
        SUM(dm.client_calls_ib)::int AS client_calls_ib,
        SUM(dm.client_calls_ob)::int AS client_calls_ob,
        SUM(dm.ssa_calls + dm.client_calls_ib + dm.client_calls_ob)::int AS total_calls,
        COUNT(DISTINCT dm.metric_date)::int AS days_active
      FROM daily_metrics dm
      WHERE dm.metric_date >= ${from} AND dm.metric_date <= ${to}
      GROUP BY dm.agent_name
      ORDER BY total_calls DESC
    `);

    // 2. Activity log entries per agent in date range
    const activityCounts = await db.execute(sql`
      SELECT
        al.created_by AS agent_name,
        COUNT(*)::int AS activity_count,
        COUNT(DISTINCT al.case_id)::int AS cases_touched
      FROM activity_log al
      WHERE al.created_at >= ${from}::date AND al.created_at < (${to}::date + interval '1 day')
      GROUP BY al.created_by
      ORDER BY activity_count DESC
    `);

    // 3. Status changes in date range (from activity log messages)
    const statusChanges = await db.execute(sql`
      SELECT
        al.created_by AS agent_name,
        COUNT(*)::int AS status_changes
      FROM activity_log al
      WHERE al.created_at >= ${from}::date AND al.created_at < (${to}::date + interval '1 day')
        AND (al.message ILIKE '%status changed%' OR al.message ILIKE '%marked as%' OR al.message ILIKE '%assigned to%')
      GROUP BY al.created_by
    `);

    // 4. Fee collections in date range (based on fee_received_date)
    const collections = await db.execute(sql`
      SELECT
        fr.assigned_to AS agent_name,
        COUNT(DISTINCT fr.case_id)::int AS cases_with_payment,
        SUM(
          CASE WHEN fr.t16_fee_received_date >= ${from} AND fr.t16_fee_received_date <= ${to} THEN COALESCE(fr.t16_fee_received, 0) ELSE 0 END +
          CASE WHEN fr.t2_fee_received_date >= ${from} AND fr.t2_fee_received_date <= ${to} THEN COALESCE(fr.t2_fee_received, 0) ELSE 0 END +
          CASE WHEN fr.aux_fee_received_date >= ${from} AND fr.aux_fee_received_date <= ${to} THEN COALESCE(fr.aux_fee_received, 0) ELSE 0 END
        ) AS collected
      FROM fee_records fr
      WHERE fr.assigned_to IS NOT NULL
        AND (
          (fr.t16_fee_received_date >= ${from} AND fr.t16_fee_received_date <= ${to})
          OR (fr.t2_fee_received_date >= ${from} AND fr.t2_fee_received_date <= ${to})
          OR (fr.aux_fee_received_date >= ${from} AND fr.aux_fee_received_date <= ${to})
        )
      GROUP BY fr.assigned_to
    `);

    // 5. Per-agent case assignments (current snapshot)
    const assignments = await db.execute(sql`
      SELECT
        fr.assigned_to AS agent_name,
        COUNT(*)::int AS total_assigned,
        COUNT(*) FILTER (WHERE fr.win_sheet_status = 'paid_in_full')::int AS pif_count,
        COUNT(*) FILTER (WHERE fr.win_sheet_status IN ('not_started','started','in_progress'))::int AS active_count,
        COUNT(*) FILTER (WHERE fr.win_sheet_status IN ('pending_payment','partially_paid'))::int AS pending_count
      FROM fee_records fr
      WHERE fr.assigned_to IS NOT NULL
      GROUP BY fr.assigned_to
      ORDER BY total_assigned DESC
    `);

    // 6. Daily breakdown for chart (calls per day)
    const dailyBreakdown = await db.execute(sql`
      SELECT
        dm.metric_date::text AS date,
        SUM(dm.ssa_calls)::int AS ssa_calls,
        SUM(dm.client_calls_ib)::int AS client_calls_ib,
        SUM(dm.client_calls_ob)::int AS client_calls_ob
      FROM daily_metrics dm
      WHERE dm.metric_date >= ${from} AND dm.metric_date <= ${to}
      GROUP BY dm.metric_date
      ORDER BY dm.metric_date
    `);

    // 7. Recent activity entries (for the feed)
    const recentActivity = await db.execute(sql`
      SELECT
        al.id,
        al.case_id,
        al.message,
        al.created_by,
        al.created_at,
        c.first_name,
        c.last_name
      FROM activity_log al
      LEFT JOIN cases c ON c.client_id = al.case_id
      WHERE al.created_at >= ${from}::date AND al.created_at < (${to}::date + interval '1 day')
      ORDER BY al.created_at DESC
      LIMIT 50
    `);

    // Merge into unified agent rows
    interface AgentRow {
      name: string;
      ssaCalls: number;
      clientCallsIb: number;
      clientCallsOb: number;
      totalCalls: number;
      daysActive: number;
      activityCount: number;
      casesTouched: number;
      statusChanges: number;
      casesWithPayment: number;
      collected: number;
      totalAssigned: number;
      pifCount: number;
      activeCount: number;
      pendingCount: number;
    }

    const agentMap = new Map<string, AgentRow>();

    const ensure = (name: string): AgentRow => {
      if (!agentMap.has(name)) {
        agentMap.set(name, {
          name,
          ssaCalls: 0,
          clientCallsIb: 0,
          clientCallsOb: 0,
          totalCalls: 0,
          daysActive: 0,
          activityCount: 0,
          casesTouched: 0,
          statusChanges: 0,
          casesWithPayment: 0,
          collected: 0,
          totalAssigned: 0,
          pifCount: 0,
          activeCount: 0,
          pendingCount: 0,
        });
      }
      return agentMap.get(name)!;
    };

    for (const r of callMetrics as unknown as {
      agent_name: string;
      ssa_calls: number;
      client_calls_ib: number;
      client_calls_ob: number;
      total_calls: number;
      days_active: number;
    }[]) {
      const a = ensure(r.agent_name);
      a.ssaCalls = r.ssa_calls;
      a.clientCallsIb = r.client_calls_ib;
      a.clientCallsOb = r.client_calls_ob;
      a.totalCalls = r.total_calls;
      a.daysActive = r.days_active;
    }
    for (const r of activityCounts as unknown as {
      agent_name: string;
      activity_count: number;
      cases_touched: number;
    }[]) {
      const a = ensure(r.agent_name);
      a.activityCount = r.activity_count;
      a.casesTouched = r.cases_touched;
    }
    for (const r of statusChanges as unknown as {
      agent_name: string;
      status_changes: number;
    }[]) {
      const a = ensure(r.agent_name);
      a.statusChanges = r.status_changes;
    }
    for (const r of collections as unknown as {
      agent_name: string;
      cases_with_payment: number;
      collected: string;
    }[]) {
      const a = ensure(r.agent_name);
      a.casesWithPayment = r.cases_with_payment;
      a.collected = Number(r.collected) || 0;
    }
    for (const r of assignments as unknown as {
      agent_name: string;
      total_assigned: number;
      pif_count: number;
      active_count: number;
      pending_count: number;
    }[]) {
      const a = ensure(r.agent_name);
      a.totalAssigned = r.total_assigned;
      a.pifCount = r.pif_count;
      a.activeCount = r.active_count;
      a.pendingCount = r.pending_count;
    }

    const agents = Array.from(agentMap.values())
      .filter((a) => a.name !== "System")
      .sort((a, b) => b.totalCalls - a.totalCalls);

    // Totals
    const totals = agents.reduce(
      (acc, a) => ({
        ssaCalls: acc.ssaCalls + a.ssaCalls,
        clientCallsIb: acc.clientCallsIb + a.clientCallsIb,
        clientCallsOb: acc.clientCallsOb + a.clientCallsOb,
        totalCalls: acc.totalCalls + a.totalCalls,
        activityCount: acc.activityCount + a.activityCount,
        casesTouched: acc.casesTouched + a.casesTouched,
        statusChanges: acc.statusChanges + a.statusChanges,
        collected: acc.collected + a.collected,
      }),
      {
        ssaCalls: 0,
        clientCallsIb: 0,
        clientCallsOb: 0,
        totalCalls: 0,
        activityCount: 0,
        casesTouched: 0,
        statusChanges: 0,
        collected: 0,
      },
    );

    return NextResponse.json({
      data: {
        from,
        to,
        agents,
        totals,
        dailyBreakdown,
        recentActivity: (
          recentActivity as unknown as {
            id: string;
            case_id: number;
            message: string;
            created_by: string;
            created_at: string;
            first_name: string | null;
            last_name: string | null;
          }[]
        ).map((r) => ({
          id: r.id,
          caseId: r.case_id,
          message: r.message,
          createdBy: r.created_by,
          createdAt: r.created_at,
          caseName:
            r.first_name && r.last_name
              ? `${r.last_name}, ${r.first_name}`
              : null,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
