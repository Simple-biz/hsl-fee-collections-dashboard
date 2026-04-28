import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyMetrics } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

// GET /api/daily-metrics?agent=Drake&date=2026-02-20
// GET /api/daily-metrics?week=2026-02-17  (returns all agents for the week)
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent");
    const date = searchParams.get("date");
    const week = searchParams.get("week");

    // Week mode: return all agents Mon-Fri
    if (week) {
      const rows = await db.execute(sql`
        SELECT
          dm.agent_name,
          dm.metric_date::text AS metric_date,
          dm.ssa_calls,
          dm.client_calls_ib,
          dm.client_calls_ob,
          dm.notes
        FROM daily_metrics dm
        WHERE dm.metric_date >= ${week}::date
          AND dm.metric_date < ${week}::date + INTERVAL '5 days'
        ORDER BY dm.agent_name, dm.metric_date
      `);

      return NextResponse.json({
        week,
        data: (
          rows as unknown as {
            agent_name: string;
            metric_date: string;
            ssa_calls: number;
            client_calls_ib: number;
            client_calls_ob: number;
            notes: string | null;
          }[]
        ).map((r) => ({
          agent: r.agent_name,
          date: r.metric_date,
          ssaCalls: r.ssa_calls,
          clientCallsIb: r.client_calls_ib,
          clientCallsOb: r.client_calls_ob,
          notes: r.notes,
        })),
      });
    }

    // Single agent+date mode
    if (!agent) {
      return NextResponse.json(
        { error: "agent or week parameter required" },
        { status: 400 },
      );
    }

    const metricDate = date || new Date().toISOString().split("T")[0];

    const [row] = await db
      .select()
      .from(dailyMetrics)
      .where(
        and(
          eq(dailyMetrics.agentName, agent),
          sql`${dailyMetrics.metricDate} = ${metricDate}::date`,
        ),
      );

    if (!row) {
      return NextResponse.json({
        agent,
        date: metricDate,
        ssaCalls: 0,
        clientCallsIb: 0,
        clientCallsOb: 0,
        notes: null,
      });
    }

    return NextResponse.json({
      agent: row.agentName,
      date: row.metricDate,
      ssaCalls: row.ssaCalls,
      clientCallsIb: row.clientCallsIb,
      clientCallsOb: row.clientCallsOb,
      notes: row.notes,
    });
  } catch (error) {
    console.error("GET /api/daily-metrics error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// POST /api/daily-metrics — Upsert daily call counts
// Supports single: { agent, date, ssaCalls, clientCallsIb, clientCallsOb, notes }
// Supports batch:  { entries: [{ agent, date, ssaCalls, clientCallsIb, clientCallsOb, notes }] }
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();

    // Batch mode
    if (body.entries && Array.isArray(body.entries)) {
      const results = [];
      for (const entry of body.entries) {
        const { agent, date, ssaCalls, clientCallsIb, clientCallsOb, notes } =
          entry;
        if (!agent || !date) continue;

        // Raw SQL upsert — works even without unique constraint via
        // INSERT ... ON CONFLICT approach, but we use delete+insert pattern
        // to be safe since the schema may not have the unique constraint yet
        await db.execute(sql`
          INSERT INTO daily_metrics (id, agent_name, metric_date, ssa_calls, client_calls_ib, client_calls_ob, notes, created_at, updated_at)
          VALUES (gen_random_uuid(), ${agent}, ${date}::date, ${ssaCalls ?? 0}, ${clientCallsIb ?? 0}, ${clientCallsOb ?? 0}, ${notes || null}, NOW(), NOW())
          ON CONFLICT (agent_name, metric_date) DO UPDATE SET
            ssa_calls = EXCLUDED.ssa_calls,
            client_calls_ib = EXCLUDED.client_calls_ib,
            client_calls_ob = EXCLUDED.client_calls_ob,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `);
        results.push({
          agent,
          date,
          ssaCalls: ssaCalls ?? 0,
          clientCallsIb: clientCallsIb ?? 0,
          clientCallsOb: clientCallsOb ?? 0,
        });
      }
      return NextResponse.json({
        status: "ok",
        count: results.length,
        data: results,
      });
    }

    // Single mode
    const { agent, date, ssaCalls, clientCallsIb, clientCallsOb, notes } = body;

    if (!agent) {
      return NextResponse.json({ error: "agent is required" }, { status: 400 });
    }

    const metricDate = date || new Date().toISOString().split("T")[0];

    await db.execute(sql`
      INSERT INTO daily_metrics (id, agent_name, metric_date, ssa_calls, client_calls_ib, client_calls_ob, notes, created_at, updated_at)
      VALUES (gen_random_uuid(), ${agent}, ${metricDate}::date, ${ssaCalls ?? 0}, ${clientCallsIb ?? 0}, ${clientCallsOb ?? 0}, ${notes || null}, NOW(), NOW())
      ON CONFLICT (agent_name, metric_date) DO UPDATE SET
        ssa_calls = EXCLUDED.ssa_calls,
        client_calls_ib = EXCLUDED.client_calls_ib,
        client_calls_ob = EXCLUDED.client_calls_ob,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    `);

    return NextResponse.json({
      status: "ok",
      data: {
        agent,
        date: metricDate,
        ssaCalls: ssaCalls ?? 0,
        clientCallsIb: clientCallsIb ?? 0,
        clientCallsOb: clientCallsOb ?? 0,
      },
    });
  } catch (error) {
    console.error("POST /api/daily-metrics error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
