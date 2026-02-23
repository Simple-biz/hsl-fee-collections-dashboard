import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords, activityLog } from "@/lib/db/schema";
import { eq, ilike, sql, desc } from "drizzle-orm";

// GET /api/cases — List cases with fee records + latest activity
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const assigned = searchParams.get("assigned");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Base query: cases joined with fee_records
    const rows = await db
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
        t2Retro: feeRecords.t2Retro,
        t2FeeDue: feeRecords.t2FeeDue,
        t2FeeReceived: feeRecords.t2FeeReceived,
        t2Pending: feeRecords.t2Pending,
        auxRetro: feeRecords.auxRetro,
        auxFeeDue: feeRecords.auxFeeDue,
        auxFeeReceived: feeRecords.auxFeeReceived,
        auxPending: feeRecords.auxPending,
        totalRetroDue: feeRecords.totalRetroDue,
        totalFeesExpected: feeRecords.totalFeesExpected,
        totalFeesPaid: feeRecords.totalFeesPaid,
        pifReadyToClose: feeRecords.pifReadyToClose,
        feeComputed: feeRecords.feeComputed,
        feeMethod: feeRecords.feeMethod,
        applicableFeeCap: feeRecords.applicableFeeCap,
        syncStatus: feeRecords.syncStatus,
        feeRecordUpdatedAt: feeRecords.updatedAt,
      })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(
        // Apply filters
        sql`TRUE
          ${search ? sql`AND (${ilike(cases.firstName, `%${search}%`)} OR ${ilike(cases.lastName, `%${search}%`)} OR ${ilike(cases.externalId, `%${search}%`)})` : sql``}
          ${status ? sql`AND ${feeRecords.winSheetStatus} = ${status}` : sql``}
          ${assigned ? sql`AND ${eq(feeRecords.assignedTo, assigned)}` : sql``}
        `,
      )
      .orderBy(desc(cases.approvalDate))
      .limit(limit)
      .offset(offset);

    // Get latest activity for each case
    const caseIds = rows.map((r) => r.clientId);

    let activities: { caseId: number; message: string }[] = [];
    if (caseIds.length > 0) {
      activities = await db
        .selectDistinctOn([activityLog.caseId], {
          caseId: activityLog.caseId,
          message: activityLog.message,
        })
        .from(activityLog)
        .where(
          sql`${activityLog.caseId} IN (${sql.join(
            caseIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .orderBy(activityLog.caseId, desc(activityLog.createdAt));
    }

    const activityMap = new Map(activities.map((a) => [a.caseId, a.message]));

    // Shape response
    const data = rows.map((r) => {
      const approvalDate = r.approvalDate ? new Date(r.approvalDate) : null;
      const now = new Date();
      const daysAfterApproval = approvalDate
        ? Math.floor(
            (now.getTime() - approvalDate.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;

      // PIF logic matching sheet: YES / NO / PENDING
      const expected = Number(r.totalFeesExpected) || 0;
      const paid = Number(r.totalFeesPaid) || 0;
      let pif: string | null = null;
      if (expected > 0) {
        if (paid >= expected) pif = "YES";
        else if (paid > 0) pif = "PENDING";
        else pif = "NO";
      }

      return {
        id: r.clientId,
        name: `${r.lastName}, ${r.firstName}`,
        assigned: r.assignedTo || "—",
        level: r.levelWon || "—",
        claim: r.claimTypeLabel === "T2_T16" ? "CONC" : r.claimTypeLabel || "—",
        date: r.approvalDate || null,
        status: r.winSheetStatus || "not_started",

        // T16
        t16Retro: Number(r.t16Retro) || 0,
        t16FeeDue: Number(r.t16FeeDue) || 0,
        t16FeeReceived: Number(r.t16FeeReceived) || 0,
        t16Pending: Number(r.t16Pending) || 0,
        t16FeeReceivedDate: null,

        // T2
        t2Retro: Number(r.t2Retro) || 0,
        t2FeeDue: Number(r.t2FeeDue) || 0,
        t2FeeReceived: Number(r.t2FeeReceived) || 0,
        t2Pending: Number(r.t2Pending) || 0,
        t2FeeReceivedDate: null,

        // AUX
        auxRetro: Number(r.auxRetro) || 0,
        auxFeeDue: Number(r.auxFeeDue) || 0,
        auxFeeReceived: Number(r.auxFeeReceived) || 0,
        auxPending: Number(r.auxPending) || 0,
        auxFeeReceivedDate: null,

        // Totals
        totalRetroDue: Number(r.totalRetroDue) || 0,
        expected,
        paid,

        // Workflow
        pif,
        approvedBy: null,
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

        office: r.officeWithJurisdiction || "—",
      };
    });

    return NextResponse.json({ data, page, limit, total: data.length });
  } catch (error) {
    console.error("GET /api/cases error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
