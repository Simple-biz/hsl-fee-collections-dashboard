import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

const resolveParams = async (context: {
  params: { id: string } | Promise<{ id: string }>;
}) => {
  const p =
    context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.id);
};

// GET /api/cases/[id] — Full case detail with fee record + activity history
export const GET = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const caseId = await resolveParams(context);

    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    // Fetch case + fee record
    const [row] = await db
      .select({
        // Case fields
        clientId: cases.clientId,
        externalId: cases.externalId,
        firstName: cases.firstName,
        lastName: cases.lastName,
        claimTypeLabel: cases.claimTypeLabel,
        levelWon: cases.levelWon,
        t2Decision: cases.t2Decision,
        t16Decision: cases.t16Decision,
        approvalDate: cases.approvalDate,
        officeWithJurisdiction: cases.officeWithJurisdiction,
        caseCreatedAt: cases.createdAt,

        // Fee record fields
        feeRecordId: feeRecords.id,
        assignedTo: feeRecords.assignedTo,
        winSheetStatus: feeRecords.winSheetStatus,
        t16Retro: feeRecords.t16Retro,
        t16FeeDue: feeRecords.t16FeeDue,
        t16FeeReceived: feeRecords.t16FeeReceived,
        t16Pending: feeRecords.t16Pending,
        t16FeeReceivedDate: feeRecords.t16FeeReceivedDate,
        t2Retro: feeRecords.t2Retro,
        t2FeeDue: feeRecords.t2FeeDue,
        t2FeeReceived: feeRecords.t2FeeReceived,
        t2Pending: feeRecords.t2Pending,
        t2FeeReceivedDate: feeRecords.t2FeeReceivedDate,
        auxRetro: feeRecords.auxRetro,
        auxFeeDue: feeRecords.auxFeeDue,
        auxFeeReceived: feeRecords.auxFeeReceived,
        auxPending: feeRecords.auxPending,
        auxFeeReceivedDate: feeRecords.auxFeeReceivedDate,
        totalRetroDue: feeRecords.totalRetroDue,
        totalFeesExpected: feeRecords.totalFeesExpected,
        totalFeesPaid: feeRecords.totalFeesPaid,
        pifReadyToClose: feeRecords.pifReadyToClose,
        approvedBy: feeRecords.approvedBy,
        feeMethod: feeRecords.feeMethod,
        applicableFeeCap: feeRecords.applicableFeeCap,
        feeCapApplied: feeRecords.feeCapApplied,
        feeComputed: feeRecords.feeComputed,
        feeComputedAt: feeRecords.feeComputedAt,
        syncStatus: feeRecords.syncStatus,
        syncedAt: feeRecords.syncedAt,
        feeRecordUpdatedAt: feeRecords.updatedAt,
      })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(eq(cases.clientId, caseId));

    if (!row) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Fetch activity log
    const activities = await db
      .select({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(eq(activityLog.caseId, caseId))
      .orderBy(desc(activityLog.createdAt));

    // Compute aging
    const approvalDate = row.approvalDate ? new Date(row.approvalDate) : null;
    const daysAfterApproval = approvalDate
      ? Math.floor(
          (Date.now() - approvalDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    const expected = Number(row.totalFeesExpected) || 0;
    const paid = Number(row.totalFeesPaid) || 0;

    const data = {
      // Case info
      id: row.clientId,
      externalId: row.externalId,
      name: `${row.lastName}, ${row.firstName}`,
      firstName: row.firstName,
      lastName: row.lastName,
      claim:
        row.claimTypeLabel === "T2_T16" ? "CONC" : row.claimTypeLabel || "—",
      level: row.levelWon || "—",
      t2Decision: row.t2Decision,
      t16Decision: row.t16Decision,
      approvalDate: row.approvalDate,
      office: row.officeWithJurisdiction || "—",
      assigned: row.assignedTo || "—",
      status: row.winSheetStatus || "not_started",

      // T16
      t16Retro: Number(row.t16Retro) || 0,
      t16FeeDue: Number(row.t16FeeDue) || 0,
      t16FeeReceived: Number(row.t16FeeReceived) || 0,
      t16Pending: Number(row.t16Pending) || 0,
      t16FeeReceivedDate: row.t16FeeReceivedDate,

      // T2
      t2Retro: Number(row.t2Retro) || 0,
      t2FeeDue: Number(row.t2FeeDue) || 0,
      t2FeeReceived: Number(row.t2FeeReceived) || 0,
      t2Pending: Number(row.t2Pending) || 0,
      t2FeeReceivedDate: row.t2FeeReceivedDate,

      // AUX
      auxRetro: Number(row.auxRetro) || 0,
      auxFeeDue: Number(row.auxFeeDue) || 0,
      auxFeeReceived: Number(row.auxFeeReceived) || 0,
      auxPending: Number(row.auxPending) || 0,
      auxFeeReceivedDate: row.auxFeeReceivedDate,

      // Totals
      totalRetroDue: Number(row.totalRetroDue) || 0,
      expected,
      paid,
      outstanding: expected - paid,

      // Workflow
      pif: row.pifReadyToClose
        ? "YES"
        : paid > 0
          ? "PENDING"
          : expected > 0
            ? "NO"
            : null,
      approvedBy: row.approvedBy,
      feeMethod: row.feeMethod,
      applicableFeeCap: Number(row.applicableFeeCap) || 9200,
      feeCapApplied: row.feeCapApplied,
      feeComputed: row.feeComputed,
      feeComputedAt: row.feeComputedAt,
      syncStatus: row.syncStatus || "not_synced",
      syncedAt: row.syncedAt,

      // Aging
      daysAfterApproval,
      approvalCategory:
        daysAfterApproval !== null
          ? daysAfterApproval > 60
            ? ">60"
            : "≤60"
          : null,

      // Activity log
      activities: activities.map((a) => ({
        id: a.id,
        message: a.message,
        createdBy: a.createdBy || "System",
        createdAt: a.createdAt,
      })),
    };

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/cases/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// PATCH /api/cases/[id] — Update case + fee record fields
// ============================================================================

export const PATCH = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const caseId = await resolveParams(context);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const body = await req.json();
    const { caseFields, feeFields, logMessage, logAuthor } = body;

    // Update case fields if provided
    if (caseFields && Object.keys(caseFields).length > 0) {
      const CASE_FIELD_MAP: Record<string, string> = {
        firstName: "first_name",
        lastName: "last_name",
        claimTypeLabel: "claim_type_label",
        levelWon: "level_won",
        t2Decision: "t2_decision",
        t16Decision: "t16_decision",
        approvalDate: "approval_date",
        officeWithJurisdiction: "office_with_jurisdiction",
      };

      const updates = Object.entries(caseFields)
        .filter(([k]) => CASE_FIELD_MAP[k])
        .map(([k, v]) => {
          const col = CASE_FIELD_MAP[k];
          if (v === null) return `${col} = NULL`;
          return `${col} = '${String(v).replace(/'/g, "''")}'`;
        });

      if (updates.length > 0) {
        await db.execute(
          sql`UPDATE cases SET ${sql.raw(updates.join(", "))}, updated_at = NOW() WHERE client_id = ${caseId}`,
        );
      }
    }

    // Update fee record fields if provided
    if (feeFields && Object.keys(feeFields).length > 0) {
      const FEE_FIELD_MAP: Record<string, string> = {
        assignedTo: "assigned_to",
        winSheetStatus: "win_sheet_status",
        t16Retro: "t16_retro",
        t16FeeDue: "t16_fee_due",
        t16FeeReceived: "t16_fee_received",
        t16Pending: "t16_pending",
        t16FeeReceivedDate: "t16_fee_received_date",
        t2Retro: "t2_retro",
        t2FeeDue: "t2_fee_due",
        t2FeeReceived: "t2_fee_received",
        t2Pending: "t2_pending",
        t2FeeReceivedDate: "t2_fee_received_date",
        auxRetro: "aux_retro",
        auxFeeDue: "aux_fee_due",
        auxFeeReceived: "aux_fee_received",
        auxPending: "aux_pending",
        auxFeeReceivedDate: "aux_fee_received_date",
        totalRetroDue: "total_retro_due",
        totalFeesExpected: "total_fees_expected",
        totalFeesPaid: "total_fees_paid",
        pifReadyToClose: "pif_ready_to_close",
        approvedBy: "approved_by",
        feeMethod: "fee_method",
        feeComputed: "fee_computed",
      };

      const updates = Object.entries(feeFields)
        .filter(([k]) => FEE_FIELD_MAP[k])
        .map(([k, v]) => {
          const col = FEE_FIELD_MAP[k];
          if (v === null) return `${col} = NULL`;
          if (typeof v === "boolean") return `${col} = ${v}`;
          if (typeof v === "number") return `${col} = ${v}`;
          return `${col} = '${String(v).replace(/'/g, "''")}'`;
        });

      if (updates.length > 0) {
        await db.execute(
          sql`UPDATE fee_records SET ${sql.raw(updates.join(", "))}, updated_at = NOW() WHERE case_id = ${caseId}`,
        );
      }
    }

    // Log activity if message provided
    if (logMessage) {
      await db.insert(activityLog).values({
        caseId,
        message: logMessage,
        createdBy: logAuthor || "System",
      });
    }

    return NextResponse.json({ status: "ok", updated: caseId });
  } catch (error) {
    console.error("PATCH /api/cases/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// POST /api/cases/[id] — Add activity log entry only
// ============================================================================

export const POST = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const caseId = await resolveParams(context);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const { message, createdBy } = await req.json();

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const [entry] = await db
      .insert(activityLog)
      .values({
        caseId,
        message: message.trim(),
        createdBy: createdBy || "System",
      })
      .returning({ id: activityLog.id, createdAt: activityLog.createdAt });

    return NextResponse.json({
      status: "ok",
      activity: {
        id: entry.id,
        message: message.trim(),
        createdBy: createdBy || "System",
        createdAt: entry.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/cases/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
