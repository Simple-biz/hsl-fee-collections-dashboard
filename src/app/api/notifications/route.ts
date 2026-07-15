import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { namesMatch } from "@/lib/formatters";
import { feePetitions } from "@/lib/db/schema";

// Notification types visible only to their assigned agent — nobody else,
// including leads/admins, sees these (unlike the other types, which are
// team-wide operational alerts visible to anyone with page access).
const AGENT_ONLY_TYPES = new Set(["follow_up_due"]);

const postBodySchema = z.object({
  type: z.enum(["case_aging", "fee_payment", "call_target_missed", "case_assigned", "follow_up_due"]),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  title: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1),
  caseId: z.number().int().nullable().optional(),
  agentName: z.string().trim().max(100).nullable().optional(),
});

const patchBodySchema = z.union([
  z.object({ markAllRead: z.literal(true) }),
  z.object({ ids: z.array(z.string()).min(1) }),
]);

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
    const session = await auth();
    const agentName = session?.user?.name;
    // Agent-only types (e.g. follow_up_due) are stripped out unless they
    // belong to the requesting user — applied after the DB query since
    // namesMatch tolerates case/whitespace drift that SQL equality wouldn't.
    const visibleToSession = (row: { type: string; agentName: string | null }) =>
      !AGENT_ONLY_TYPES.has(row.type) || namesMatch(row.agentName, agentName);

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

    const rows = (
      await db
        .select()
        .from(notifications)
        .where(whereClause)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
    ).filter(visibleToSession);

    // Unread count — same agent-only scoping as above.
    const unreadRows = await db
      .select({ type: notifications.type, agentName: notifications.agentName })
      .from(notifications)
      .where(eq(notifications.isRead, false));
    const unreadCount = unreadRows.filter(visibleToSession).length;

    // Optionally compute live alerts (expensive — use sparingly)
    let liveAlerts: typeof rows = [];
    if (computeLive) {
      liveAlerts = (await computeLiveAlerts()).filter(visibleToSession);
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsedBody = postBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsedBody.error.flatten() },
        { status: 422 },
      );
    }
    const { type, severity, title, message, caseId, agentName } = parsedBody.data;

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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const parsedBody = patchBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsedBody.error.flatten() },
        { status: 422 },
      );
    }
    const body = parsedBody.data;

    if ("markAllRead" in body) {
      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.isRead, false));

      return NextResponse.json({ status: "ok", message: "All marked as read" });
    }

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(inArray(notifications.id, body.ids));

    return NextResponse.json({ status: "ok", count: body.ids.length });
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
        AND COALESCE(tm.role, '') != 'team_lead'
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

  // 5. Follow-up calls due today. Agent-scoped in the GET handler — this
  // just computes the full set like the other four blocks.
  const followUpsDueToday = await db.execute(sql`
    SELECT
      c.client_id,
      c.first_name || ' ' || c.last_name AS claimant,
      fr.assigned_to
    FROM fee_records fr
    JOIN cases c ON c.client_id = fr.case_id
    WHERE fr.is_closed = FALSE
      AND fr.next_follow_up_date = CURRENT_DATE
    ORDER BY c.client_id
  `);

  for (const row of followUpsDueToday as unknown as {
    client_id: number;
    claimant: string;
    assigned_to: string | null;
  }[]) {
    alerts.push({
      id: `live-followup-${row.client_id}`,
      type: "follow_up_due",
      severity: "warning",
      title: `Follow-up call due today — ${row.claimant}`,
      message: `A follow-up call is scheduled for today for ${row.claimant}.`,
      caseId: row.client_id,
      agentName: row.assigned_to || null,
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    });
  }

  // 6. Fee petition follow-up calls due today (Jan / Racquel and other
  // petition specialists who set next_follow_up_date on their cases)
  const petitionFollowUpsDueToday = await db.execute(sql`
    SELECT
      c.client_id,
      c.first_name || ' ' || c.last_name AS claimant,
      fp.assigned_to
    FROM ${feePetitions} fp
    JOIN cases c ON c.client_id = fp.case_id
    WHERE fp.next_follow_up_date = CURRENT_DATE
    ORDER BY c.client_id
  `);

  for (const row of petitionFollowUpsDueToday as unknown as {
    client_id: number;
    claimant: string;
    assigned_to: string | null;
  }[]) {
    alerts.push({
      id: `live-petition-followup-${row.client_id}`,
      type: "follow_up_due",
      severity: "warning",
      title: `Fee petition follow-up due today — ${row.claimant}`,
      message: `A fee petition follow-up call is scheduled for today for ${row.claimant}.`,
      caseId: row.client_id,
      agentName: row.assigned_to || null,
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    });
  }

  return alerts;
}
