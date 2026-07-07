import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog, userDetails } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireCapability, requireAdmin, guardStatus } from "@/lib/auth-helpers";

// Loose on purpose — the actual set of writable columns is whitelisted by
// CASE_FIELD_MAP/FEE_FIELD_MAP/UD_FIELD_MAP below. This just rejects a
// malformed body (wrong top-level shape, a field that isn't a scalar) before
// any of that field-mapping logic runs.
const scalarValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const patchBodySchema = z.object({
  caseFields: z.record(z.string(), scalarValue).optional(),
  feeFields: z.record(z.string(), scalarValue).optional(),
  userDetailsFields: z.record(z.string(), scalarValue).optional(),
  logMessage: z.string().optional(),
});

// Fee fields that count as "finalizing" a case — gated by case.finalize rather
// than the broader case.update (members can record payments but not close,
// reopen, mark overpaid, or sign off "OK to close").
const FINALIZE_FEE_FIELDS = ["isClosed", "markedOverpaid", "approvedBy"] as const;

// Fee fields that require the fees.edit capability — members can edit what's
// due (case.update, below), but only designated users (e.g. Ms. Jazz) can
// record what's actually been received.
const FEE_RECEIVED_FIELDS = [
  "t16FeeReceived", "t16FeeReceivedDate",
  "t2FeeReceived", "t2FeeReceivedDate",
  "auxFeeReceived", "auxFeeReceivedDate",
] as const;

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
        approvedBy: feeRecords.approvedBy,
        feesConfirmation: feeRecords.feesConfirmation,
        feesClosedTrigger: feeRecords.feesClosedTrigger,
        caseStatus: feeRecords.caseStatus,
        isClosed: feeRecords.isClosed,
        markedOverpaid: feeRecords.markedOverpaid,
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
        row.claimTypeLabel === "T2_T16" || row.claimTypeLabel === "CONCURRENT"
          ? "CONC"
          : row.claimTypeLabel || "—",
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
      t16FeeDue: row.t16FeeDue != null ? Number(row.t16FeeDue) : null,
      t16FeeReceived: Number(row.t16FeeReceived) || 0,
      t16Pending: Number(row.t16Pending) || 0,
      t16FeeReceivedDate: row.t16FeeReceivedDate,

      // T2
      t2Retro: Number(row.t2Retro) || 0,
      t2FeeDue: row.t2FeeDue != null ? Number(row.t2FeeDue) : null,
      t2FeeReceived: Number(row.t2FeeReceived) || 0,
      t2Pending: Number(row.t2Pending) || 0,
      t2FeeReceivedDate: row.t2FeeReceivedDate,

      // AUX
      auxRetro: Number(row.auxRetro) || 0,
      auxFeeDue: row.auxFeeDue != null ? Number(row.auxFeeDue) : null,
      auxFeeReceived: Number(row.auxFeeReceived) || 0,
      auxPending: Number(row.auxPending) || 0,
      auxFeeReceivedDate: row.auxFeeReceivedDate,

      // Totals
      totalRetroDue: Number(row.totalRetroDue) || 0,
      expected,
      paid,
      outstanding: expected - paid,

      // Workflow
      approvedBy: row.approvedBy,
      feesConfirmation: row.feesConfirmation ?? null,
      feesClosedTrigger: row.feesClosedTrigger ?? null,
      caseStatus: row.caseStatus ?? null,
      isClosed: row.isClosed ?? false,
      markedOverpaid: row.markedOverpaid ?? false,
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

    const parsedBody = patchBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsedBody.error.flatten() },
        { status: 422 },
      );
    }
    // NOTE: any client-supplied author is intentionally ignored — the activity
    // author is stamped from the authenticated session below so it can't be
    // spoofed.
    const { caseFields, feeFields, userDetailsFields, logMessage: clientLogMessage } = parsedBody.data;
    // Mutable — the Overpaid auto-flag below appends to whatever the client
    // sent so the activity log names the side effect, not just the edit.
    let logMessage = clientLogMessage;

    // Authorize: any update needs case.update. Finalizing fields (close/reopen,
    // mark overpaid, approvedBy) additionally need case.finalize, and editing
    // client PII (user_details) needs case.editPii. Admins can grant any of
    // these to a member per-user via the access overrides modal.
    const update = await requireCapability("case.update");
    if (!update.ok) {
      return NextResponse.json(
        { error: update.error },
        { status: guardStatus(update.error) },
      );
    }

    const touchesFinalize =
      feeFields &&
      FINALIZE_FEE_FIELDS.some((k) => k in feeFields);
    if (touchesFinalize) {
      const fin = await requireCapability("case.finalize");
      if (!fin.ok) {
        return NextResponse.json(
          { error: "You don't have permission to close, reopen, mark overpaid, or approve cases." },
          { status: guardStatus(fin.error) },
        );
      }
    }

    const touchesFeeReceived =
      feeFields &&
      FEE_RECEIVED_FIELDS.some((k) => k in feeFields);
    if (touchesFeeReceived) {
      const feeEdit = await requireCapability("fees.edit");
      if (!feeEdit.ok) {
        return NextResponse.json(
          { error: "You don't have permission to record fees received." },
          { status: guardStatus(feeEdit.error) },
        );
      }
    }

    if (feeFields && "feesConfirmation" in feeFields) {
      const feesConfGuard = await requireCapability("feesConfirmation.edit");
      if (!feesConfGuard.ok) {
        return NextResponse.json(
          { error: "You don't have permission to update PIF." },
          { status: guardStatus(feesConfGuard.error) },
        );
      }
    }

    if (feeFields && "feesClosedTrigger" in feeFields) {
      const admin = await requireAdmin();
      if (!admin.ok) {
        return NextResponse.json(
          { error: "Only admins can update Fees Closed." },
          { status: guardStatus(admin.error) },
        );
      }
    }

    if (userDetailsFields && Object.keys(userDetailsFields).length > 0) {
      const pii = await requireCapability("case.editPii");
      if (!pii.ok) {
        return NextResponse.json(
          { error: "You don't have permission to edit client PII." },
          { status: guardStatus(pii.error) },
        );
      }
    }

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
        externalId: "external_id",
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
        winSheetLink: "win_sheet_link",
        winSheetLinkText: "win_sheet_link_text",
        t16Retro: "t16_retro",
        t16FeeDue: "t16_fee_due",
        t16FeeReceived: "t16_fee_received",
        t16FeeReceivedDate: "t16_fee_received_date",
        t2Retro: "t2_retro",
        t2FeeDue: "t2_fee_due",
        t2FeeReceived: "t2_fee_received",
        t2FeeReceivedDate: "t2_fee_received_date",
        auxRetro: "aux_retro",
        auxFeeDue: "aux_fee_due",
        auxFeeReceived: "aux_fee_received",
        auxFeeReceivedDate: "aux_fee_received_date",
        totalRetroDue: "total_retro_due",
        totalFeesExpected: "total_fees_expected",
        totalFeesPaid: "total_fees_paid",
        pifReadyToClose: "pif_ready_to_close",
        approvedBy: "approved_by",
        feesConfirmation: "fees_confirmation",
        feesClosedTrigger: "fees_closed_trigger",
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

      // Setting Fees Confirmation to "Overpaid" also flags the case as
      // overpaid — the same way a case shows up on Fee Petitions purely from
      // its Level, it should show up on Overpaid Cases purely from this
      // dropdown, without a separate manual "Mark Overpaid" step. Only
      // auto-sets it on; correcting a mis-click back to another confirmation
      // value doesn't auto-unmark it, since Overpaid Cases tracks its own
      // resolution workflow (notices sent, checks cleared) that shouldn't
      // silently disappear.
      if (
        feeFields.feesConfirmation === "Overpaid" &&
        !("markedOverpaid" in feeFields)
      ) {
        updates.push("marked_overpaid = true");
        // Clears a stale dismissal from an earlier, unrelated overpayment on
        // this case — otherwise this new one would be silently hidden from
        // Overpaid Cases by that old dismissal (same pattern as
        // bulkRemoveFromOverpaid's own dismissal handling).
        updates.push("overpaid_dismissed_at = NULL");
        logMessage = logMessage
          ? `${logMessage} — also flagged as overpaid`
          : "Flagged as overpaid (PIF set to \"Overpaid\")";
      }

      if (updates.length > 0) {
        // Retro, Fee Due, and Fee Received are plain editable columns —
        // nothing here derives Fee Due from Retro. Pending is deliberately
        // absent from FEE_FIELD_MAP above: it's fully derived (Fee Due minus
        // Received) by the compute_fee_totals trigger on every write to an
        // open record, so accepting it here would be a no-op for open cases
        // and a real footgun for closed ones (the trigger skips closed
        // records entirely, so a stray write here would actually persist).
        await db.execute(sql`
          UPDATE fee_records SET ${sql.raw(updates.join(", "))}, updated_at = NOW()
          WHERE case_id = ${caseId}
        `);
      }
    }

    // Update user_details fields if provided
    if (userDetailsFields && Object.keys(userDetailsFields).length > 0) {
      const UD_FIELD_MAP: Record<string, string> = {
        ssnLast4: "ssn_last4",
        chronicleId: "chronicle_id",
      };

      const colDefs: { col: string; sqlVal: string }[] = [];
      for (const [k, v] of Object.entries(userDetailsFields)) {
        const col = UD_FIELD_MAP[k];
        if (!col) continue;
        let sqlVal: string;
        if (v === null) sqlVal = "NULL";
        else if (typeof v === "number") sqlVal = String(v);
        else sqlVal = `'${String(v).replace(/'/g, "''")}'`;
        colDefs.push({ col, sqlVal });
      }

      if (colDefs.length > 0) {
        const insertCols = colDefs.map((d) => d.col).join(", ");
        const insertVals = colDefs.map((d) => d.sqlVal).join(", ");
        const conflictSet = colDefs.map((d) => `${d.col} = ${d.sqlVal}`).join(", ");
        await db.execute(
          sql`
            INSERT INTO user_details (case_id, ${sql.raw(insertCols)}, updated_at)
            VALUES (${caseId}, ${sql.raw(insertVals)}, NOW())
            ON CONFLICT (case_id) DO UPDATE
              SET ${sql.raw(conflictSet)}, updated_at = NOW()
          `,
        );
      }
    }

    // Log activity if message provided. Author is the authenticated user.
    if (logMessage) {
      await db.insert(activityLog).values({
        caseId,
        message: logMessage,
        createdBy: update.session.user?.name?.trim() || "Unknown",
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
    // Adding an activity note is an update-level action.
    const guard = await requireCapability("case.update");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const caseId = await resolveParams(context);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    // Author is stamped from the session — a client-supplied author is ignored
    // so notes can't be attributed to someone else.
    const author = guard.session.user?.name?.trim() || "Unknown";
    const { message } = await req.json();

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
        createdBy: author,
      })
      .returning({ id: activityLog.id, createdAt: activityLog.createdAt });

    return NextResponse.json({
      status: "ok",
      activity: {
        id: entry.id,
        message: message.trim(),
        createdBy: author,
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
    // Deleting cases is admin-only by default (overridable per-user).
    const guard = await requireCapability("case.delete");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

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
