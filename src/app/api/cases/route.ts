import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog, leaderNotes, userDetails, feePetitions } from "@/lib/db/schema";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { requireCapability, guardStatus, sessionHasCapability } from "@/lib/auth-helpers";

// GET /api/cases — List cases with fee records + latest activity
export const GET = async (req: NextRequest) => {
  try {
    // leaderNotesCount is only computed/returned for sessions with
    // leaderNotes.access — members shouldn't learn even the count exists.
    const session = await auth();
    const canSeeLeaderNotes = sessionHasCapability(session, "leaderNotes.access");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const assigned = searchParams.get("assigned");
    // isClosed: "true" → closed only, "false" → active only, anything else
    // (incl. absent) → no filter (preserves search/back-compat behavior).
    const isClosedParam = searchParams.get("isClosed");
    // dueToday: cases with a follow-up scheduled for today — the result set
    // is inherently small (however many follow-ups are due), so pagination
    // is bypassed rather than risking truncation for a poller that needs
    // every match.
    const dueToday = searchParams.get("dueToday") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = dueToday ? 10000 : parseInt(searchParams.get("limit") || "50");
    const offset = dueToday ? 0 : (page - 1) * limit;

    // Shared WHERE for the count and main queries.
    const whereClause = sql`TRUE
      ${search ? sql`AND (${ilike(cases.firstName, `%${search}%`)} OR ${ilike(cases.lastName, `%${search}%`)} OR ${ilike(cases.externalId, `%${search}%`)})` : sql``}
      ${status ? sql`AND ${feeRecords.winSheetStatus} = ${status}` : sql``}
      ${assigned ? sql`AND ${eq(feeRecords.assignedTo, assigned)}` : sql``}
      ${isClosedParam === "true" ? sql`AND COALESCE(${feeRecords.isClosed}, false) = true` : sql``}
      ${isClosedParam === "false" ? sql`AND COALESCE(${feeRecords.isClosed}, false) = false` : sql``}
      ${dueToday ? sql`AND ${feeRecords.nextFollowUpDate} = CURRENT_DATE` : sql``}
    `;

    // Total count (respecting filters, ignoring pagination)
    const countQuery = db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(whereClause);

    // Base query: cases joined with fee_records
    const rowsQuery = db
      .select({
        // Case fields
        id: cases.id,
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

        // Fee record fields
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
        feeComputed: feeRecords.feeComputed,
        feeMethod: feeRecords.feeMethod,
        applicableFeeCap: feeRecords.applicableFeeCap,
        syncStatus: feeRecords.syncStatus,
        feesStatus: feeRecords.feesStatus,
        weekAssignedToAgent: feeRecords.weekAssignedToAgent,
        monthAssignedToAgent: feeRecords.monthAssignedToAgent,
        feeRecordUpdatedAt: feeRecords.updatedAt,
        isClosed: feeRecords.isClosed,
        markedOverpaid: feeRecords.markedOverpaid,
        closedAt: feeRecords.closedAt,
        approvedBy: feeRecords.approvedBy,
        feesConfirmation: feeRecords.feesConfirmation,
        feesClosedTrigger: feeRecords.feesClosedTrigger,
        caseStatus: feeRecords.caseStatus,
        nextFollowUpDate: feeRecords.nextFollowUpDate,
        winSheetLink: feeRecords.winSheetLink,
        winSheetLinkText: feeRecords.winSheetLinkText,

        // Chronicle id (from user_details) — powers the Chronicle link in the
        // name column. one-to-one join, so it can't multiply rows.
        udChronicleId: userDetails.chronicleId,
      })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .leftJoin(userDetails, eq(userDetails.caseId, cases.clientId))
      .where(whereClause)
      .orderBy(desc(cases.approvalDate))
      .limit(limit)
      .offset(offset);

    // Count and page query are independent — run them on separate pooled
    // connections instead of back-to-back.
    const [totalRows, rows] = await Promise.all([countQuery, rowsQuery]);
    const total = totalRows[0]?.count ?? 0;

    // Get latest activity + notes count for the page's cases
    const caseIds = rows.map((r) => r.clientId);

    let activities: { caseId: number; message: string }[] = [];
    let notesCounts: { caseId: number; count: number }[] = [];
    let leaderNotesCounts: { caseId: number; count: number }[] = [];
    if (caseIds.length > 0) {
      const inClause = sql`${activityLog.caseId} IN (${sql.join(
        caseIds.map((id) => sql`${id}`),
        sql`, `,
      )})`;

      // All independent of each other, so fire them together.
      [activities, notesCounts, leaderNotesCounts] = await Promise.all([
        db
          .selectDistinctOn([activityLog.caseId], {
            caseId: activityLog.caseId,
            message: activityLog.message,
          })
          .from(activityLog)
          .where(inClause)
          .orderBy(activityLog.caseId, desc(activityLog.createdAt)),
        db
          .select({
            caseId: activityLog.caseId,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(activityLog)
          .where(inClause)
          .groupBy(activityLog.caseId),
        canSeeLeaderNotes
          ? db
              .select({
                caseId: leaderNotes.caseId,
                count: sql<number>`COUNT(*)::int`,
              })
              .from(leaderNotes)
              .where(
                sql`${leaderNotes.caseId} IN (${sql.join(
                  caseIds.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              )
              .groupBy(leaderNotes.caseId)
          : Promise.resolve([]),
      ]);
    }

    const activityMap = new Map(activities.map((a) => [a.caseId, a.message]));
    const notesCountMap = new Map(notesCounts.map((n) => [n.caseId, n.count]));
    const leaderNotesCountMap = new Map(
      leaderNotesCounts.map((n) => [n.caseId, n.count]),
    );

    // Shape response
    const data = rows.map((r) => {
      const approvalDate = r.approvalDate ? new Date(r.approvalDate) : null;
      const now = new Date();
      const daysAfterApproval = approvalDate
        ? Math.floor(
            (now.getTime() - approvalDate.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;

      // PIF logic matching sheet: YES / NO / PENDING.
      // expected/paid are computed from the per-benefit subtotals so the
      // table values match the dashboard cards regardless of whether the
      // stored aggregate columns (total_fees_*) were populated.
      const expected =
        (Number(r.t16FeeDue) || 0) +
        (Number(r.t2FeeDue) || 0) +
        (Number(r.auxFeeDue) || 0);
      const paid =
        (Number(r.t16FeeReceived) || 0) +
        (Number(r.t2FeeReceived) || 0) +
        (Number(r.auxFeeReceived) || 0);
      let pif: string | null = null;
      if (expected > 0) {
        if (paid >= expected) pif = "YES";
        else if (paid > 0) pif = "PENDING";
        else pif = "NO";
      }

      return {
        id: r.clientId,
        name: `${r.lastName}, ${r.firstName}`,
        // MyCase case URL (stored on import); makes the name a deep link.
        externalId: r.externalId ?? null,
        // Chronicle client id → builds the Chronicle deep link in the name cell.
        chronicleId: r.udChronicleId ?? null,
        assigned: r.assignedTo || "—",
        level: r.levelWon || "—",
        claim: r.claimTypeLabel === "T2_T16" || r.claimTypeLabel === "CONCURRENT" ? "CONC" : r.claimTypeLabel || "—",
        date: r.approvalDate || null,
        status: r.winSheetStatus || "not_started",

        // T16
        t16Retro: Number(r.t16Retro) || 0,
        t16FeeDue: r.t16FeeDue != null ? Number(r.t16FeeDue) : null,
        t16FeeReceived: Number(r.t16FeeReceived) || 0,
        t16Pending: Number(r.t16Pending) || 0,
        t16FeeReceivedDate: r.t16FeeReceivedDate ?? null,

        // T2
        t2Retro: Number(r.t2Retro) || 0,
        t2FeeDue: r.t2FeeDue != null ? Number(r.t2FeeDue) : null,
        t2FeeReceived: Number(r.t2FeeReceived) || 0,
        t2Pending: Number(r.t2Pending) || 0,
        t2FeeReceivedDate: r.t2FeeReceivedDate ?? null,

        // AUX
        auxRetro: Number(r.auxRetro) || 0,
        auxFeeDue: r.auxFeeDue != null ? Number(r.auxFeeDue) : null,
        auxFeeReceived: Number(r.auxFeeReceived) || 0,
        auxPending: Number(r.auxPending) || 0,
        auxFeeReceivedDate: r.auxFeeReceivedDate ?? null,

        // Totals
        totalRetroDue: Number(r.totalRetroDue) || 0,
        expected,
        paid,

        // Workflow
        pif,
        approvedBy: r.approvedBy ?? null,
        feesConfirmation: r.feesConfirmation ?? null,
        feesClosedTrigger: r.feesClosedTrigger ?? null,
        caseStatus: r.caseStatus ?? null,
        nextFollowUpDate: r.nextFollowUpDate ?? null,
        isClosed: r.isClosed ?? false,
        markedOverpaid: r.markedOverpaid ?? false,
        closedAt: r.closedAt ? r.closedAt.toISOString() : null,
        update: activityMap.get(r.clientId) || "—",
        sync: r.syncStatus || "not_synced",

        // Aging
        daysAfterApproval,
        approvalCategory:
          daysAfterApproval !== null
            ? daysAfterApproval > 60
              ? ">60"
              : "≤60"
            : null,

        feesStatus: r.feesStatus ?? null,
        weekAssignedToAgent: r.weekAssignedToAgent ?? null,
        monthAssignedToAgent: r.monthAssignedToAgent ?? null,
        office: r.officeWithJurisdiction || "—",
        notesCount: notesCountMap.get(r.clientId) ?? 0,
        // Always 0 for sessions without leaderNotes.access, regardless of
        // the real count — the field must never leak that leader notes
        // exist on a case to a member inspecting the response.
        leaderNotesCount: leaderNotesCountMap.get(r.clientId) ?? 0,
        winSheetLink: r.winSheetLink ?? null,
        winSheetLinkText: r.winSheetLinkText ?? null,
      };
    });

    return NextResponse.json({ data, page, limit, total });
  } catch (error) {
    console.error("GET /api/cases error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// POST /api/cases — Create a new case (+ its fee record) manually
// ============================================================================

// Trim strings and coerce blanks to undefined so optional fields stay null.
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const createCaseSchema = z.object({
  // The MyCase client id; doubles as the join key for fee_records/activity_log.
  clientId: z.coerce.number().int().positive(),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  externalId: optionalText,
  claimTypeLabel: optionalText,
  levelWon: optionalText,
  // HTML date input gives YYYY-MM-DD; the `date` column stores it verbatim.
  approvalDate: optionalText,
  officeWithJurisdiction: optionalText,
  aljFirstName: optionalText,
  aljLastName: optionalText,
  assignedTo: optionalText,
  winSheetStatus: optionalText,
  // Chronicle client id → persisted to user_details so the dashboard can deep
  // link to Chronicle. Blank/absent stays undefined.
  chronicleId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
});

export const POST = async (req: NextRequest) => {
  try {
    // Creating cases is admin-only by default (overridable per-user).
    const guard = await requireCapability("case.create");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const parsed = createCaseSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // clientId is unique — reject a duplicate up front with a clear message
    // rather than surfacing a raw Postgres constraint error.
    const [existing] = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.clientId, input.clientId))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: `A case with Client ID ${input.clientId} already exists.` },
        { status: 409 },
      );
    }

    // Insert the case then its fee record (FK references cases.client_id).
    // Not wrapped in a txn: the unique check above makes a partial insert
    // unlikely, and the fee record can be backfilled if the second write fails.
    await db.insert(cases).values({
      clientId: input.clientId,
      firstName: input.firstName,
      lastName: input.lastName,
      externalId: input.externalId,
      claimTypeLabel: input.claimTypeLabel,
      levelWon: input.levelWon,
      approvalDate: input.approvalDate,
      officeWithJurisdiction: input.officeWithJurisdiction,
      aljFirstName: input.aljFirstName,
      aljLastName: input.aljLastName,
    });

    await db.insert(feeRecords).values({
      caseId: input.clientId,
      assignedTo: input.assignedTo,
      winSheetStatus: input.winSheetStatus ?? "not_started",
    });

    if (input.levelWon === "FEE_PETITION") {
      await db.insert(feePetitions).values({ caseId: input.clientId }).onConflictDoNothing();
    }

    // Best-effort: persist the Chronicle id so the case deep-links to Chronicle.
    // onConflictDoNothing guards the case_id unique key; the .catch swallows a
    // chronicle_id unique collision (another case already owns it) so a bad id
    // never fails an otherwise-successful case creation.
    if (input.chronicleId != null) {
      await db
        .insert(userDetails)
        .values({ caseId: input.clientId, chronicleId: input.chronicleId })
        .onConflictDoNothing()
        .catch(() => null);
    }

    await db.insert(activityLog).values({
      caseId: input.clientId,
      message: "Case created manually",
      createdBy: "System",
    });

    return NextResponse.json(
      { status: "ok", clientId: input.clientId },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/cases error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
