import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords, overpaidCases } from "@/lib/db/schema";
import { eq, ilike, sql } from "drizzle-orm";
import { requirePageAccess, guardStatus } from "@/lib/auth-helpers";

const SORT_KEYS = ["claimant", "feesReceived", "overpaidAmount", "opLtrDate", "noticeSent", "assignedTo", "createdAt"] as const;
type SortKey = (typeof SORT_KEYS)[number];

// GET /api/overpaid-cases?page=&limit=&search=&sort=&dir=&status=&agent=&ltr=&minAmount=&maxAmount=
// Returns cases where total_fees_paid > total_fees_expected
export const GET = async (req: NextRequest) => {
  try {
    const guard = await requirePageAccess("overpaid_cases");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const agent = searchParams.get("agent");
    const ltr = searchParams.get("ltr"); // "none" = no LTR received yet
    const minAmountRaw = searchParams.get("minAmount");
    const maxAmountRaw = searchParams.get("maxAmount");
    const sortParam = searchParams.get("sort");
    const sort: SortKey = SORT_KEYS.includes(sortParam as SortKey)
      ? (sortParam as SortKey)
      : "createdAt";
    const dir = searchParams.get("dir") === "asc" ? sql`asc` : sql`desc`;
    const rawPage = parseInt(searchParams.get("page") || "1");
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 10000) : 50;
    const offset = (page - 1) * limit;

    const minAmount = minAmountRaw && Number.isFinite(Number(minAmountRaw)) ? Number(minAmountRaw) : null;
    const maxAmount = maxAmountRaw && Number.isFinite(Number(maxAmountRaw)) ? Number(maxAmountRaw) : null;

    const overpaidCondition = sql`COALESCE(${feeRecords.markedOverpaid}, false) = true AND ${feeRecords.overpaidDismissedAt} IS NULL`;
    const overpaidExpr = sql`(${feeRecords.totalFeesPaid}::numeric - ${feeRecords.totalFeesExpected}::numeric)`;

    const statusClause =
      status === "cleared"
        ? sql`AND COALESCE(${overpaidCases.checksCleared}, false) = true`
        : status === "pending"
          ? sql`AND COALESCE(${overpaidCases.checksCleared}, false) = false`
          : sql``;

    const searchClause = search
      ? sql`AND (${ilike(cases.firstName, `%${search}%`)} OR ${ilike(cases.lastName, `%${search}%`)} OR ${ilike(cases.externalId, `%${search}%`)})`
      : sql``;

    const ltrClause = ltr === "none" ? sql`AND ${overpaidCases.opLtrReceived} IS NULL` : sql``;
    const minClause = minAmount != null ? sql`AND ${overpaidExpr} >= ${minAmount}` : sql``;
    const maxClause = maxAmount != null ? sql`AND ${overpaidExpr} <= ${maxAmount}` : sql``;

    const whereClause = sql`${overpaidCondition}
      ${searchClause}
      ${statusClause}
      ${agent === "__unassigned__"
        ? sql`AND ${feeRecords.assignedTo} IS NULL`
        : agent
          ? sql`AND ${feeRecords.assignedTo} = ${agent}`
          : sql``}
      ${ltrClause}
      ${minClause}
      ${maxClause}
    `;

    // Agent counts — respects all filters except agent itself
    const agentBaseClause = sql`${overpaidCondition}
      ${searchClause}
      ${statusClause}
      ${ltrClause}
      ${minClause}
      ${maxClause}
    `;
    const agentRows = await db
      .select({
        assignedTo: feeRecords.assignedTo,
        caseCount: sql<number>`COUNT(*)::int`,
      })
      .from(cases)
      .innerJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .leftJoin(overpaidCases, eq(overpaidCases.caseId, cases.clientId))
      .where(agentBaseClause)
      .groupBy(feeRecords.assignedTo)
      .orderBy(feeRecords.assignedTo);
    const agents = agentRows
      .filter((r): r is { assignedTo: string; caseCount: number } => r.assignedTo != null)
      .map((r) => ({ name: r.assignedTo, count: r.caseCount }));
    const unassignedCount = agentRows.find((r) => r.assignedTo == null)?.caseCount ?? 0;

    // Aggregate stats (respects all active filters including agent)
    const [agg] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        totalOverpaid: sql<number>`ROUND(SUM(${overpaidExpr}) FILTER (WHERE COALESCE(${overpaidCases.checksCleared}, false) = false), 2)`,
        clearedTotalOverpaid: sql<number>`ROUND(SUM(${overpaidExpr}) FILTER (WHERE COALESCE(${overpaidCases.checksCleared}, false) = true), 2)`,
        clearedCount: sql<number>`COUNT(*) FILTER (WHERE COALESCE(${overpaidCases.checksCleared}, false) = true)::int`,
        ltrCount: sql<number>`COUNT(*) FILTER (WHERE ${overpaidCases.opLtrReceived} IS NOT NULL)::int`,
      })
      .from(cases)
      .innerJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .leftJoin(overpaidCases, eq(overpaidCases.caseId, cases.clientId))
      .where(whereClause);

    const total = agg?.total ?? 0;
    const totalOverpaid = Number(agg?.totalOverpaid ?? 0);
    const clearedTotalOverpaid = Number(agg?.clearedTotalOverpaid ?? 0);
    const clearedCount = agg?.clearedCount ?? 0;
    const ltrCount = agg?.ltrCount ?? 0;

    const orderClause =
      sort === "claimant"
        ? sql`${cases.lastName} ${dir} NULLS LAST, ${cases.firstName} ${dir} NULLS LAST`
        : sort === "feesReceived"
          ? sql`${feeRecords.totalFeesPaid}::numeric ${dir} NULLS LAST`
          : sort === "opLtrDate"
            ? sql`${overpaidCases.opLtrReceived} ${dir} NULLS LAST`
            : sort === "noticeSent"
              ? sql`${overpaidCases.opLtrDate} ${dir} NULLS LAST`
              : sort === "assignedTo"
              ? sql`${feeRecords.assignedTo} ${dir} NULLS LAST`
              : sort === "overpaidAmount"
                ? sql`${overpaidCases.overpaidAmount} ${dir} NULLS LAST`
                : sql`${cases.createdAt} ${dir} NULLS LAST`;

    const rows = await db
      .select({
        clientId: cases.clientId,
        firstName: cases.firstName,
        lastName: cases.lastName,
        externalId: cases.externalId,
        assignedTo: feeRecords.assignedTo,
        feesReceived: sql<string>`ROUND(${feeRecords.totalFeesPaid}::numeric, 2)`,
        overpaidAmount: overpaidCases.overpaidAmount,
        feesConfirmation: feeRecords.feesConfirmation,
        opLtrDate: overpaidCases.opLtrDate,
        opLtrReceived: overpaidCases.opLtrReceived,
        checksCleared: overpaidCases.checksCleared,
        checksClearedAt: overpaidCases.checksClearedAt,
        updateNote: overpaidCases.updateNote,
        region: overpaidCases.region,
        updatedAt: overpaidCases.updatedAt,
      })
      .from(cases)
      .innerJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .leftJoin(overpaidCases, eq(overpaidCases.caseId, cases.clientId))
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      id: r.clientId,
      claimant: `${r.lastName}, ${r.firstName}`,
      externalId: r.externalId ?? null,
      assignedTo: r.assignedTo ?? null,
      feesReceived: Number(r.feesReceived),
      overpaidAmount: r.overpaidAmount != null ? Number(r.overpaidAmount) : null,
      feesConfirmation: r.feesConfirmation ?? null,
      opLtrDate: r.opLtrDate ?? null,
      opLtrReceived: r.opLtrReceived ?? null,
      checksCleared: r.checksCleared ?? false,
      checksClearedAt: r.checksClearedAt ? (r.checksClearedAt as Date).toISOString() : null,
      updateNote: r.updateNote ?? "",
      region: r.region ?? null,
      updatedAt: r.updatedAt ? (r.updatedAt as Date).toISOString() : null,
    }));

    // Sum as integer cents on the server so the footer never drifts from float math.
    const pageFeesCents = rows.reduce((s, r) => s + Math.round(parseFloat(r.feesReceived) * 100), 0);
    const pageOverpaidCents = rows.reduce((s, r) => !r.checksCleared && r.overpaidAmount != null ? s + Math.round(parseFloat(r.overpaidAmount) * 100) : s, 0);
    const pageFeesReceived = pageFeesCents / 100;
    const pageOverpaid = pageOverpaidCents / 100;

    return NextResponse.json({ data, page, limit, total, totalOverpaid, clearedTotalOverpaid, clearedCount, ltrCount, agents, unassignedCount, pageFeesReceived, pageOverpaid });
  } catch (error) {
    console.error("GET /api/overpaid-cases error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 },
    );
  }
};
