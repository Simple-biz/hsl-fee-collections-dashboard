import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyMetrics } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

// GET /api/daily-metrics?agent=Drake&date=2026-02-20
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const agent = searchParams.get("agent");
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!agent) {
      return NextResponse.json(
        { error: "agent parameter required" },
        { status: 400 },
      );
    }

    const [row] = await db
      .select()
      .from(dailyMetrics)
      .where(
        and(
          eq(dailyMetrics.agentName, agent),
          sql`${dailyMetrics.metricDate} = ${date}::date`,
        ),
      );

    if (!row) {
      return NextResponse.json({
        agent,
        date,
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
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { agent, date, ssaCalls, clientCallsIb, clientCallsOb, notes } = body;

    if (!agent) {
      return NextResponse.json({ error: "agent is required" }, { status: 400 });
    }

    const metricDate = date || new Date().toISOString().split("T")[0];

    const [result] = await db
      .insert(dailyMetrics)
      .values({
        agentName: agent,
        metricDate,
        ssaCalls: ssaCalls ?? 0,
        clientCallsIb: clientCallsIb ?? 0,
        clientCallsOb: clientCallsOb ?? 0,
        notes: notes || null,
      })
      .onConflictDoUpdate({
        target: [dailyMetrics.agentName, dailyMetrics.metricDate],
        set: {
          ssaCalls: sql`EXCLUDED.ssa_calls`,
          clientCallsIb: sql`EXCLUDED.client_calls_ib`,
          clientCallsOb: sql`EXCLUDED.client_calls_ob`,
          notes: sql`EXCLUDED.notes`,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();

    return NextResponse.json({ status: "ok", data: result });
  } catch (error) {
    console.error("POST /api/daily-metrics error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
