import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, sql, desc, and, inArray } from "drizzle-orm";

// ============================================================================
// GET /api/notifications
// Query params:
//   ?type=case_aging,fee_payment   (comma-separated filter)
//   ?unread=true                   (only unread)
//   ?limit=50                      (default 50)
//   ?computeLive=true              (also compute real-time alerts)
// ============================================================================
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get("type")?.split(",").filter(Boolean);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "50") || 50,
      200,
    );
    const computeLive = searchParams.get("computeLive") === "true";

    // Build conditions
    const conditions = [];
    if (typeFilter && typeFilter.length > 0) {
      conditions.push(
        sql`${notifications.type} IN (${sql.join(
          typeFilter.map((t) => sql`${t}`),
          sql`, `,
        )})`,
      );
    }
    if (unreadOnly) {
      conditions.push(eq(notifications.isRead, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    // Unread count
    const [{ count: unreadCount }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(notifications)
      .where(eq(notifications.isRead, false));

    // Optionally compute live alerts (expensive — use sparingly)
    let liveAlerts: typeof rows = [];
    if (computeLive) {
      liveAlerts = await computeLiveAlerts();
    }

    return NextResponse.json({
      notifications: rows.map(formatRow),
      liveAlerts: liveAlerts.map(formatRow),
      unreadCount,
      total: rows.length,
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// POST /api/notifications — Create a notification
// Body: { type, severity?, title, message, caseId?, agentName? }
// ============================================================================
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { type, severity, title, message, caseId, agentName } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: "type, title, and message are required" },
        { status: 400 },
      );
    }

    const [row] = await db
      .insert(notifications)
      .values({
        type,
        severity: severity || "info",
        title,
        message,
        caseId: caseId || null,
        agentName: agentName || null,
      })
      .returning();

    return NextResponse.json({ status: "ok", notification: formatRow(row) });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// PATCH /api/notifications — Mark as read
// Body: { ids: string[] } or { markAllRead: true }
// ============================================================================
export const PATCH = async (req: NextRequest) => {
  try {
    const body = await req.json();

    if (body.markAllRead) {
      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.isRead, false));

      return NextResponse.json({ status: "ok", message: "All marked as read" });
    }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(inArray(notifications.id, body.ids));

      return NextResponse.json({ status: "ok", count: body.ids.length });
    }

    return NextResponse.json(
      { error: "ids or markAllRead required" },
      { status: 400 },
    );
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// Helpers
// ============================================================================

function formatRow(row: typeof notifications.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    caseId: row.caseId,
    agentName: row.agentName,
    isRead: row.isRead,
    readAt: row.readAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Compute real-time alerts from live database state (not stored as notifications) */
async function computeLiveAlerts() {
  const alerts: {
    id: string;
    type: (typeof notifications.$inferSelect)["type"];
    severity: (typeof notifications.$inferSelect)["severity"];
    title: string;
    message: string;
    caseId: number | null;
    agentName: string | null;
    isRead: boolean;
    readAt: Date | null;
    createdAt: Date;
  }[] = [];

  // 1. Cases aging past 60 days unpaid
  const agingCases = await db.execute(sql`
    SELECT
      c.client_id,
      c.first_name || ' ' || c.last_name AS claimant,
      c.claim_type_label,
      c.approval_date,
      CURRENT_DATE - c.approval_date::date AS days_since_approval,
      fr.assigned_to,
      COALESCE(fr.t2_pending::numeric, 0) + COALESCE(fr.t16_pending::numeric, 0) AS total_pending
    FROM cases c
    JOIN fee_records fr ON fr.case_id = c.client_id
    WHERE c.approval_date IS NOT NULL
      AND c.approval_date::date < CURRENT_DATE - INTERVAL '60 days'
      AND (COALESCE(fr.t2_pending::numeric, 0) + COALESCE(fr.t16_pending::numeric, 0)) > 0
      AND fr.pif_ready_to_close = FALSE
    ORDER BY days_since_approval DESC
    LIMIT 20
  `);

  for (const row of agingCases as unknown as {
    client_id: number;
    claimant: string;
    claim_type_label: string;
    days_since_approval: number;
    assigned_to: string;
    total_pending: number;
  }[]) {
    alerts.push({
      id: `live-aging-${row.client_id}`,
      type: "case_aging",
      severity: row.days_since_approval > 90 ? "critical" : "warning",
      title: `${row.claimant} — ${row.days_since_approval} days unpaid`,
      message: `${row.claim_type_label} case approved ${row.days_since_approval} days ago with $${Number(row.total_pending).toLocaleString()} pending. Assigned to ${row.assigned_to || "unassigned"}.`,
      caseId: row.client_id,
      agentName: row.assigned_to || null,
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    });
  }

  // 2. Recent fee payments (last 7 days)
  const recentPayments = await db.execute(sql`
    SELECT
      c.client_id,
      c.first_name || ' ' || c.last_name AS claimant,
      fr.assigned_to,
      fr.total_fees_paid::numeric AS total_paid,
      fr.t2_fee_received_date,
      fr.t16_fee_received_date,
      fr.win_sheet_status,
      fr.updated_at
    FROM fee_records fr
    JOIN cases c ON c.client_id = fr.case_id
    WHERE fr.total_fees_paid::numeric > 0
      AND fr.updated_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.updated_at DESC
    LIMIT 15
  `);

  for (const row of recentPayments as unknown as {
    client_id: number;
    claimant: string;
    assigned_to: string;
    total_paid: number;
    win_sheet_status: string;
    updated_at: string;
  }[]) {
    alerts.push({
      id: `live-payment-${row.client_id}`,
      type: "fee_payment",
      severity: "info",
      title: `Payment received — ${row.claimant}`,
      message: `$${Number(row.total_paid).toLocaleString()} collected. Status: ${row.win_sheet_status?.replace(/_/g, " ") || "unknown"}. Agent: ${row.assigned_to || "unassigned"}.`,
      caseId: row.client_id,
      agentName: row.assigned_to || null,
      isRead: false,
      readAt: null,
      createdAt: new Date(row.updated_at),
    });
  }

  // 3. Call targets not met (yesterday — agents with 0 calls logged)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dayOfWeek = yesterday.getDay();
  // Only check weekdays
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const missedCalls = await db.execute(sql`
      SELECT
        tm.name AS agent,
        COALESCE(dm.ssa_calls, 0) AS ssa_calls,
        COALESCE(dm.client_calls_ib + dm.client_calls_ob, 0) AS client_calls
      FROM team_members tm
      LEFT JOIN daily_metrics dm ON dm.agent_name = tm.name AND dm.metric_date = ${yesterdayStr}::date
      WHERE tm.is_active = TRUE
        AND (dm.id IS NULL OR (dm.ssa_calls = 0 AND dm.client_calls_ib = 0 AND dm.client_calls_ob = 0))
    `);

    for (const row of missedCalls as unknown as {
      agent: string;
      ssa_calls: number;
      client_calls: number;
    }[]) {
      alerts.push({
        id: `live-calls-${row.agent}-${yesterdayStr}`,
        type: "call_target_missed",
        severity: "warning",
        title: `No calls logged — ${row.agent}`,
        message: `${row.agent} logged 0 SSA calls and 0 client calls on ${yesterdayStr}.`,
        caseId: null,
        agentName: row.agent,
        isRead: false,
        readAt: null,
        createdAt: new Date(yesterdayStr + "T09:00:00"),
      });
    }
  }

  // 4. New cases assigned (last 7 days — cases with recent assignment)
  const newAssignments = await db.execute(sql`
    SELECT
      c.client_id,
      c.first_name || ' ' || c.last_name AS claimant,
      c.claim_type_label,
      fr.assigned_to,
      fr.created_at
    FROM fee_records fr
    JOIN cases c ON c.client_id = fr.case_id
    WHERE fr.assigned_to IS NOT NULL
      AND fr.created_at > NOW() - INTERVAL '7 days'
    ORDER BY fr.created_at DESC
    LIMIT 15
  `);

  for (const row of newAssignments as unknown as {
    client_id: number;
    claimant: string;
    claim_type_label: string;
    assigned_to: string;
    created_at: string;
  }[]) {
    alerts.push({
      id: `live-assigned-${row.client_id}`,
      type: "case_assigned",
      severity: "info",
      title: `New case assigned — ${row.claimant}`,
      message: `${row.claim_type_label || "Case"} assigned to ${row.assigned_to}.`,
      caseId: row.client_id,
      agentName: row.assigned_to,
      isRead: false,
      readAt: null,
      createdAt: new Date(row.created_at),
    });
  }

  return alerts;
}
