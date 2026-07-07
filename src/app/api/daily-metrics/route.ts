import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { dailyMetrics } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sessionHasCapability } from "@/lib/auth-helpers";
import { namesMatch } from "@/lib/formatters";

// Members can only log their own calls — agent_name is matched against the
// session's display name (team_members.name mirrors users.name for real
// accounts), tolerant of case/whitespace drift between the two independently
// -edited fields. dailyMetrics.editOthers (lead/admin by default, grantable
// per-user via the access overrides modal) can log for anyone.
const canWriteAgent = (session: Session, agent: string): boolean =>
  sessionHasCapability(session, "dailyMetrics.editOthers") ||
  namesMatch(agent, session.user?.name);

// GET /api/daily-metrics?agent=Drake&date=2026-02-20
// GET /api/daily-metrics?week=2026-02-17  (returns all agents for the week)
export const GET = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

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
          dm.win_sheets_created,
          dm.fax_sent,
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
            win_sheets_created: number;
            fax_sent: number;
            notes: string | null;
          }[]
        ).map((r) => ({
          agent: r.agent_name,
          date: r.metric_date,
          ssaCalls: r.ssa_calls,
          clientCallsIb: r.client_calls_ib,
          clientCallsOb: r.client_calls_ob,
          winSheetsCreated: r.win_sheets_created,
          faxSent: r.fax_sent,
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
        faxSent: 0,
        notes: null,
      });
    }

    return NextResponse.json({
      agent: row.agentName,
      date: row.metricDate,
      ssaCalls: row.ssaCalls,
      clientCallsIb: row.clientCallsIb,
      clientCallsOb: row.clientCallsOb,
      winSheetsCreated: row.winSheetsCreated,
      faxSent: row.faxSent,
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const body = await req.json();

    // Batch mode
    if (body.entries && Array.isArray(body.entries)) {
      const results = [];
      let skipped = 0;
      for (const entry of body.entries) {
        const { agent, date, ssaCalls, clientCallsIb, clientCallsOb, winSheetsCreated, faxSent, notes } =
          entry;
        if (!agent || !date) continue;
        if (!canWriteAgent(session, agent)) {
          skipped++;
          continue;
        }

        await db.execute(sql`
          INSERT INTO daily_metrics (id, agent_name, metric_date, ssa_calls, client_calls_ib, client_calls_ob, win_sheets_created, fax_sent, notes, created_at, updated_at)
          VALUES (gen_random_uuid(), ${agent}, ${date}::date, ${ssaCalls ?? 0}, ${clientCallsIb ?? 0}, ${clientCallsOb ?? 0}, ${winSheetsCreated ?? 0}, ${faxSent ?? 0}, ${notes || null}, NOW(), NOW())
          ON CONFLICT (agent_name, metric_date) DO UPDATE SET
            ssa_calls = EXCLUDED.ssa_calls,
            client_calls_ib = EXCLUDED.client_calls_ib,
            client_calls_ob = EXCLUDED.client_calls_ob,
            win_sheets_created = EXCLUDED.win_sheets_created,
            fax_sent = EXCLUDED.fax_sent,
            notes = EXCLUDED.notes,
            updated_at = NOW()
        `);
        results.push({
          agent,
          date,
          ssaCalls: ssaCalls ?? 0,
          clientCallsIb: clientCallsIb ?? 0,
          clientCallsOb: clientCallsOb ?? 0,
          winSheetsCreated: winSheetsCreated ?? 0,
          faxSent: faxSent ?? 0,
        });
      }
      return NextResponse.json({
        status: "ok",
        count: results.length,
        skipped,
        data: results,
      });
    }

    // Single mode
    const { agent, date, ssaCalls, clientCallsIb, clientCallsOb, winSheetsCreated, faxSent, notes } = body;

    if (!agent) {
      return NextResponse.json({ error: "agent is required" }, { status: 400 });
    }
    if (!canWriteAgent(session, agent)) {
      return NextResponse.json(
        { error: "You can only log your own calls." },
        { status: 403 },
      );
    }

    const metricDate = date || new Date().toISOString().split("T")[0];

    await db.execute(sql`
      INSERT INTO daily_metrics (id, agent_name, metric_date, ssa_calls, client_calls_ib, client_calls_ob, win_sheets_created, fax_sent, notes, created_at, updated_at)
      VALUES (gen_random_uuid(), ${agent}, ${metricDate}::date, ${ssaCalls ?? 0}, ${clientCallsIb ?? 0}, ${clientCallsOb ?? 0}, ${winSheetsCreated ?? 0}, ${faxSent ?? 0}, ${notes || null}, NOW(), NOW())
      ON CONFLICT (agent_name, metric_date) DO UPDATE SET
        ssa_calls = EXCLUDED.ssa_calls,
        client_calls_ib = EXCLUDED.client_calls_ib,
        client_calls_ob = EXCLUDED.client_calls_ob,
        win_sheets_created = EXCLUDED.win_sheets_created,
        fax_sent = EXCLUDED.fax_sent,
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
        winSheetsCreated: winSheetsCreated ?? 0,
        faxSent: faxSent ?? 0,
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
