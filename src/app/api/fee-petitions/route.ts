import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feePetitions, feeRecords } from "@/lib/db/schema";
import { eq, ilike, sql } from "drizzle-orm";

const SORT_KEYS = ["claimant", "approvalDate", "updatedAt", "progress"] as const;
type SortKey = (typeof SORT_KEYS)[number];

// Fee Requested/Received are sums across t16/t2/aux fee_records columns, but
// the Fee Petitions table edits them as a single inline value — resolve to
// whichever one benefit type the case is actually using. Cases labeled
// "concurrent" almost always still have only one type with real numbers
// (T16 and T2 are rarely both filled in at once); prefer whichever type
// already has data, and only fall back to the registered claim label when
// nothing has been entered yet.
const resolveActiveFeeType = (
  claimTypeLabel: string | null,
  t16Retro: number,
  t2Retro: number,
  auxRetro: number,
): "t16" | "t2" | "aux" => {
  if (t16Retro > 0 && t2Retro <= 0 && auxRetro <= 0) return "t16";
  if (t2Retro > 0 && t16Retro <= 0 && auxRetro <= 0) return "t2";
  if (auxRetro > 0 && t16Retro <= 0 && t2Retro <= 0) return "aux";
  // More than one type has data (rare) — T16 is the primary edit target.
  if (t16Retro > 0) return "t16";
  if (t2Retro > 0) return "t2";
  if (auxRetro > 0) return "aux";
  // Nothing entered yet — default from the case's registered claim type.
  if (claimTypeLabel === "T2") return "t2";
  return "t16";
};

const getMissingClause = (key: string | null) => {
  switch (key) {
    case "timeDelineation": return sql`AND COALESCE(${feePetitions.timeDelineation}, false) = false`;
    case "feePetitionDoc": return sql`AND COALESCE(${feePetitions.feePetitionDoc}, false) = false`;
    case "ltrToClmt": return sql`AND COALESCE(${feePetitions.ltrToClmt}, false) = false`;
    case "ltrToClmtWithSignature": return sql`AND COALESCE(${feePetitions.ltrToClmtWithSignature}, false) = false`;
    case "ltrToAlj": return sql`AND COALESCE(${feePetitions.ltrToAlj}, false) = false`;
    case "faxConfFeePet": return sql`AND COALESCE(${feePetitions.faxConfFeePet}, false) = false`;
    default: return sql``;
  }
};

// GET /api/fee-petitions?page=&limit=&search=&sort=&dir=&status=&touched=&missing=&aging=&assignedTo=
// Lists cases at FEE_PETITION level with checklist state and aggregate stats
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status"); // "complete" | "incomplete"
    const touched = searchParams.get("touched"); // "none" = no fee_petitions row yet
    const missing = searchParams.get("missing"); // checkbox key to filter by
    const aging = searchParams.get("aging"); // "unpaid_60" | "unpaid_90"
    const assignedTo = searchParams.get("assignedTo"); // fee petition specialist name
    const sortParam = searchParams.get("sort");
    const sort: SortKey = SORT_KEYS.includes(sortParam as SortKey)
      ? (sortParam as SortKey)
      : "approvalDate";
    const dir = searchParams.get("dir") === "asc" ? sql`asc` : sql`desc`;
    const rawPage = parseInt(searchParams.get("page") || "1");
    const rawLimit = parseInt(searchParams.get("limit") || "50");
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 10000) : 50;
    const offset = (page - 1) * limit;

    // All 6 checklist fields true (NULLs from LEFT JOIN coalesce to false).
    // NOA dropped from the checklist — a petition can now be filed without it.
    const allChecked = sql`(
      COALESCE(${feePetitions.timeDelineation}, false)
      AND COALESCE(${feePetitions.feePetitionDoc}, false)
      AND COALESCE(${feePetitions.ltrToClmt}, false)
      AND COALESCE(${feePetitions.ltrToClmtWithSignature}, false)
      AND COALESCE(${feePetitions.ltrToAlj}, false)
      AND COALESCE(${feePetitions.faxConfFeePet}, false)
    )`;

    // A petition only belongs in "Completed Petitions" once the checklist is
    // done AND fees have actually been received — finishing the paperwork
    // alone isn't enough to file it as complete. `allChecked` on its own
    // still drives the per-row checklist progress badge (7/7) client-side,
    // which intentionally stays independent of fee timing.
    const isFullyComplete = sql`(${allChecked} AND COALESCE(${feeRecords.totalFeesPaid}, 0)::numeric > 0)`;

    // Sum of checked boxes — used for progress sort
    const progressExpr = sql`(
      COALESCE(${feePetitions.timeDelineation}, false)::int +
      COALESCE(${feePetitions.feePetitionDoc}, false)::int +
      COALESCE(${feePetitions.ltrToClmt}, false)::int +
      COALESCE(${feePetitions.ltrToClmtWithSignature}, false)::int +
      COALESCE(${feePetitions.ltrToAlj}, false)::int +
      COALESCE(${feePetitions.faxConfFeePet}, false)::int
    )`;

    const statusClause =
      status === "complete"
        ? sql`AND ${isFullyComplete}`
        : status === "incomplete"
          ? sql`AND NOT ${isFullyComplete}`
          : sql``;

    const searchClause = search
      ? sql`AND (${ilike(cases.firstName, `%${search}%`)} OR ${ilike(cases.lastName, `%${search}%`)} OR ${ilike(cases.externalId, `%${search}%`)})`
      : sql``;

    const touchedClause = touched === "none" ? sql`AND ${feePetitions.updatedAt} IS NULL` : sql``;
    const missingClause = getMissingClause(missing);
    const agingClause =
      aging === "unpaid_60"
        ? sql`AND COALESCE(${feeRecords.totalFeesPaid}, 0) = 0 AND ${cases.approvalDate} IS NOT NULL AND (CURRENT_DATE - ${cases.approvalDate}::date) > 60`
        : aging === "unpaid_90"
          ? sql`AND COALESCE(${feeRecords.totalFeesPaid}, 0) = 0 AND ${cases.approvalDate} IS NOT NULL AND (CURRENT_DATE - ${cases.approvalDate}::date) > 90`
          : sql``;
    const assignedToClause =
      assignedTo === "__unassigned__"
        ? sql`AND ${feePetitions.assignedTo} IS NULL`
        : assignedTo
          ? sql`AND ${feePetitions.assignedTo} = ${assignedTo}`
          : sql``;

    // Accept both the legacy enum value and the worksheet-direct label
    // saved via the dashboard dropdown (column C in the master sheet uses
    // "FEE PETITION" with a space). Exclude cases already closed to Fees Closed.
    const whereClause = sql`${cases.levelWon} IN ('FEE_PETITION', 'FEE PETITION')
      AND (${feeRecords.isClosed} IS NULL OR ${feeRecords.isClosed} = false)
      ${searchClause}
      ${statusClause}
      ${touchedClause}
      ${missingClause}
      ${agingClause}
      ${assignedToClause}
    `;

    // Base clause excludes the assignedTo filter itself, so the dropdown's
    // per-specialist counts reflect every other active filter while still
    // offering every specialist as an option (not just the selected one).
    const assignedToBaseClause = sql`${cases.levelWon} IN ('FEE_PETITION', 'FEE PETITION')
      AND (${feeRecords.isClosed} IS NULL OR ${feeRecords.isClosed} = false)
      ${searchClause}
      ${statusClause}
      ${touchedClause}
      ${missingClause}
      ${agingClause}
    `;
    const assignedToRows = await db
      .select({
        assignedTo: feePetitions.assignedTo,
        caseCount: sql<number>`COUNT(*)::int`,
      })
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(assignedToBaseClause)
      .groupBy(feePetitions.assignedTo)
      .orderBy(feePetitions.assignedTo);
    const assignees = assignedToRows
      .filter((r): r is { assignedTo: string; caseCount: number } => r.assignedTo != null)
      .map((r) => ({ name: r.assignedTo, count: r.caseCount }));
    const unassignedCount = assignedToRows.find((r) => r.assignedTo == null)?.caseCount ?? 0;

    // Single aggregate for stats + count. Fee totals sum across the FULL
    // filtered set (not just the current page), so they stay accurate
    // regardless of pagination.
    const [agg] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        completeCount: sql<number>`COUNT(*) FILTER (WHERE ${isFullyComplete})::int`,
        neverTouchedCount: sql<number>`COUNT(*) FILTER (WHERE ${feePetitions.updatedAt} IS NULL)::int`,
        totalFeeRequested: sql<number>`COALESCE(SUM(${feeRecords.totalFeesExpected}), 0)::numeric`,
        totalFeesReceived: sql<number>`COALESCE(SUM(${feeRecords.totalFeesPaid}), 0)::numeric`,
      })
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(whereClause);

    const total = agg?.total ?? 0;
    const completeCount = agg?.completeCount ?? 0;
    const incompleteCount = total - completeCount;
    const neverTouchedCount = agg?.neverTouchedCount ?? 0;
    const totalFeeRequested = Number(agg?.totalFeeRequested) || 0;
    const totalFeesReceived = Number(agg?.totalFeesReceived) || 0;

    const orderClause =
      sort === "claimant"
        ? sql`${cases.lastName} ${dir} NULLS LAST, ${cases.firstName} ${dir} NULLS LAST`
        : sort === "updatedAt"
          ? sql`${feePetitions.updatedAt} ${dir} NULLS LAST`
          : sort === "progress"
            ? sql`${progressExpr} ${dir} NULLS LAST`
            : sql`${cases.approvalDate} ${dir} NULLS LAST`;

    const rows = await db
      .select({
        clientId: cases.clientId,
        firstName: cases.firstName,
        lastName: cases.lastName,
        externalId: cases.externalId,
        approvalDate: cases.approvalDate,
        claimTypeLabel: cases.claimTypeLabel,
        totalFeesExpected: feeRecords.totalFeesExpected,
        totalFeesPaid: feeRecords.totalFeesPaid,
        t16Retro: feeRecords.t16Retro,
        t2Retro: feeRecords.t2Retro,
        auxRetro: feeRecords.auxRetro,
        assignedTo: feePetitions.assignedTo,
        noa: feePetitions.noa,
        timeDelineation: feePetitions.timeDelineation,
        feePetitionDoc: feePetitions.feePetitionDoc,
        ltrToClmt: feePetitions.ltrToClmt,
        ltrToClmtWithSignature: feePetitions.ltrToClmtWithSignature,
        ltrToAlj: feePetitions.ltrToAlj,
        faxConfFeePet: feePetitions.faxConfFeePet,
        updateNote: feePetitions.updateNote,
        updatedAt: feePetitions.updatedAt,
      })
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      id: r.clientId,
      claimant: `${r.lastName}, ${r.firstName}`,
      externalId: r.externalId ?? null,
      approvalDate: r.approvalDate ?? null,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString().slice(0, 10) : null,
      feeAmount: r.totalFeesExpected != null ? Number(r.totalFeesExpected) : null,
      feesReceived: r.totalFeesPaid != null ? Number(r.totalFeesPaid) : null,
      activeFeeType: resolveActiveFeeType(
        r.claimTypeLabel,
        Number(r.t16Retro) || 0,
        Number(r.t2Retro) || 0,
        Number(r.auxRetro) || 0,
      ),
      assignedTo: r.assignedTo ?? null,
      noa: r.noa ?? false,
      timeDelineation: r.timeDelineation ?? false,
      feePetitionDoc: r.feePetitionDoc ?? false,
      ltrToClmt: r.ltrToClmt ?? false,
      ltrToClmtWithSignature: r.ltrToClmtWithSignature ?? false,
      ltrToAlj: r.ltrToAlj ?? false,
      faxConfFeePet: r.faxConfFeePet ?? false,
      updateNote: r.updateNote ?? "",
    }));

    return NextResponse.json({
      data,
      page,
      limit,
      total,
      completeCount,
      incompleteCount,
      neverTouchedCount,
      totalFeeRequested,
      totalFeesReceived,
      assignees,
      unassignedCount,
    });
  } catch (error) {
    console.error("GET /api/fee-petitions error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 },
    );
  }
};
