import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog, userDetails } from "@/lib/db/schema";
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

    // Fetch case + fee record (built as a query, awaited below in Promise.all
    // alongside the activity-log query — both depend only on caseId).
    const caseQuery = db
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

        // PDF-extracted fields
        fullSsn: cases.fullSsn,
        dob: cases.dob,
        email: cases.email,
        phone: cases.phone,
        primaryDiagnosis: cases.primaryDiagnosis,
        primaryDiagnosisCode: cases.primaryDiagnosisCode,
        secondaryDiagnosis: cases.secondaryDiagnosis,
        secondaryDiagnosisCode: cases.secondaryDiagnosisCode,
        allegations: cases.allegations,
        blindDli: cases.blindDli,
        lastInsured: cases.lastInsured,
        firmName: cases.firmName,
        firmEin: cases.firmEin,
        hearingOffice: cases.hearingOffice,
        representatives: cases.representatives,
        decisionHistory: cases.decisionHistory,

        // Fee record fields
        feeRecordId: feeRecords.id,
        assignedTo: feeRecords.assignedTo,
        winSheetStatus: feeRecords.winSheetStatus,
        winSheetLink: feeRecords.winSheetLink,
        winSheetLinkText: feeRecords.winSheetLinkText,
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
        feesConfirmation: feeRecords.feesConfirmation,
        caseStatus: feeRecords.caseStatus,
        isClosed: feeRecords.isClosed,
        closedAt: feeRecords.closedAt,
        feeMethod: feeRecords.feeMethod,
        applicableFeeCap: feeRecords.applicableFeeCap,
        feeCapApplied: feeRecords.feeCapApplied,
        feeComputed: feeRecords.feeComputed,
        feeComputedAt: feeRecords.feeComputedAt,
        syncStatus: feeRecords.syncStatus,
        syncedAt: feeRecords.syncedAt,
        feesStatus: feeRecords.feesStatus,
        weekAssignedToAgent: feeRecords.weekAssignedToAgent,
        monthAssignedToAgent: feeRecords.monthAssignedToAgent,
        feeRecordUpdatedAt: feeRecords.updatedAt,

        // user_details fields
        udChronicleId: userDetails.chronicleId,
        udFullName: userDetails.fullName,
        udAddressLine1: userDetails.addressLine1,
        udAddressLine2: userDetails.addressLine2,
        udCity: userDetails.city,
        udState: userDetails.state,
        udZipCode: userDetails.zipCode,
        udCountry: userDetails.country,
        udCellPhone: userDetails.cellPhone,
        udEmail: userDetails.email,
        udSsn: userDetails.ssn,
        udDateOfBirth: userDetails.dateOfBirth,
        udAgeAtApproval: userDetails.ageAtApproval,
        udPlaceOfBirth: userDetails.placeOfBirth,
        udMothersName: userDetails.mothersFirstNameAndMaidenName,
        udFathersName: userDetails.fathersFirstAndLastName,
      })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .leftJoin(userDetails, eq(userDetails.caseId, cases.clientId))
      .where(eq(cases.clientId, caseId));

    // Activity log — independent of the case query (only needs caseId),
    // so kick it off in parallel rather than waiting on the join above.
    const activitiesQuery = db
      .select({
        id: activityLog.id,
        message: activityLog.message,
        createdBy: activityLog.createdBy,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .where(eq(activityLog.caseId, caseId))
      .orderBy(desc(activityLog.createdAt));

    const [caseRows, activities] = await Promise.all([caseQuery, activitiesQuery]);
    const row = caseRows[0];

    if (!row) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Compute aging
    const approvalDate = row.approvalDate ? new Date(row.approvalDate) : null;
    const daysAfterApproval = approvalDate
      ? Math.floor(
          (Date.now() - approvalDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    // Computed from per-benefit subtotals to stay in sync with the dashboard
    // cards (which also sum t16+t2+aux instead of using the stored
    // total_fees_* columns).
    const expected =
      (Number(row.t16FeeDue) || 0) +
      (Number(row.t2FeeDue) || 0) +
      (Number(row.auxFeeDue) || 0);
    const paid =
      (Number(row.t16FeeReceived) || 0) +
      (Number(row.t2FeeReceived) || 0) +
      (Number(row.auxFeeReceived) || 0);

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
      winSheetLink: row.winSheetLink ?? null,
      winSheetLinkText: row.winSheetLinkText ?? null,

      // PDF-extracted fields
      fullSsn: row.fullSsn || null,
      dob: row.dob || null,
      email: row.email || null,
      phone: row.phone || null,
      primaryDiagnosis: row.primaryDiagnosis || null,
      primaryDiagnosisCode: row.primaryDiagnosisCode || null,
      secondaryDiagnosis: row.secondaryDiagnosis || null,
      secondaryDiagnosisCode: row.secondaryDiagnosisCode || null,
      allegations: row.allegations || null,
      blindDli: row.blindDli || null,
      lastInsured: row.lastInsured || null,
      firmName: row.firmName || null,
      firmEin: row.firmEin || null,
      hearingOffice: row.hearingOffice || null,
      representatives: row.representatives || null,
      decisionHistory: row.decisionHistory || null,

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
      feesConfirmation: row.feesConfirmation ?? null,
      caseStatus: row.caseStatus ?? null,
      isClosed: row.isClosed ?? false,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
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

      feesStatus: row.feesStatus ?? null,
      weekAssignedToAgent: row.weekAssignedToAgent ?? null,
      monthAssignedToAgent: row.monthAssignedToAgent ?? null,

      // User details
      userDetails: {
        chronicleId: row.udChronicleId ?? null,
        fullName: row.udFullName || null,
        addressLine1: row.udAddressLine1 || null,
        addressLine2: row.udAddressLine2 || null,
        city: row.udCity || null,
        state: row.udState || null,
        zipCode: row.udZipCode || null,
        country: row.udCountry || null,
        cellPhone: row.udCellPhone || null,
        email: row.udEmail || null,
        ssn: row.udSsn || null,
        dateOfBirth: row.udDateOfBirth || null,
        ageAtApproval: row.udAgeAtApproval || null,
        placeOfBirth: row.udPlaceOfBirth || null,
        mothersName: row.udMothersName || null,
        fathersName: row.udFathersName || null,
      },

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
    const { caseFields, feeFields, userDetailsFields, logMessage, logAuthor } = body;

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
        feesConfirmation: "fees_confirmation",
        caseStatus: "case_status",
        feeMethod: "fee_method",
        feeComputed: "fee_computed",
        isClosed: "is_closed",
        markedOverpaid: "marked_overpaid",
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

      // When isClosed flips, also stamp/clear closed_at so the fees-closed
      // page can show "closed on …" without the client having to track time.
      if (feeFields.isClosed === true) {
        updates.push("closed_at = NOW()");
      } else if (feeFields.isClosed === false) {
        updates.push("closed_at = NULL");
      }

      if (updates.length > 0) {
        await db.execute(
          sql`UPDATE fee_records SET ${sql.raw(updates.join(", "))}, updated_at = NOW() WHERE case_id = ${caseId}`,
        );
      }
    }

    // Update user_details fields if provided
    if (userDetailsFields && Object.keys(userDetailsFields).length > 0) {
      const UD_FIELD_MAP: Record<string, string> = {
        ssnLast4: "ssn_last4",
        chronicleId: "chronicle_id",
      };

      const updates = Object.entries(userDetailsFields)
        .filter(([k]) => UD_FIELD_MAP[k])
        .map(([k, v]) => {
          const col = UD_FIELD_MAP[k];
          if (v === null) return `${col} = NULL`;
          if (typeof v === "number") return `${col} = ${v}`;
          return `${col} = '${String(v).replace(/'/g, "''")}'`;
        });

      if (updates.length > 0) {
        await db.execute(
          sql`
            INSERT INTO user_details (case_id, updated_at)
            VALUES (${caseId}, NOW())
            ON CONFLICT (case_id) DO UPDATE
              SET ${sql.raw(updates.join(", "))}, updated_at = NOW()
          `,
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

// ============================================================================
// DELETE /api/cases/[id] — Delete case + fee record + activity log
// ============================================================================

export const DELETE = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const caseId = await resolveParams(context);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    // Delete in order: activity_log → fee_records → cases (foreign key deps)
    await db.execute(sql`DELETE FROM activity_log WHERE case_id = ${caseId}`);
    await db.execute(sql`DELETE FROM notifications WHERE case_id = ${caseId}`);
    await db.execute(sql`DELETE FROM fee_records WHERE case_id = ${caseId}`);
    await db.execute(sql`DELETE FROM cases WHERE client_id = ${caseId}`);

    return NextResponse.json({ status: "ok", deleted: caseId });
  } catch (error) {
    console.error("DELETE /api/cases/[id] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
