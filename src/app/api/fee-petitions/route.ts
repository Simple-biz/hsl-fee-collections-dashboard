import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feePetitions, feeRecords, activityLog } from "@/lib/db/schema";
import { eq, ilike, sql, inArray } from "drizzle-orm";
import { requirePageAccess, guardStatus } from "@/lib/auth-helpers";

const SORT_KEYS = ["claimant", "approvalDate", "updatedAt", "progress", "createdAt"] as const;
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

// Shared by the list query and the single-row refresh query below, so both
// stay in lockstep — a per-row refresh must return the exact same shape the
// list endpoint would have given that row.
const ROW_COLUMNS = {
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
  feePetitionApproved: feePetitions.feePetitionApproved,
  updateNote: feePetitions.updateNote,
  nextFollowUpDate: feePetitions.nextFollowUpDate,
  feePetitionUuid: feePetitions.id,
  updatedAt: feePetitions.updatedAt,
};

type FeePetitionQueryRow = {
  clientId: number;
  firstName: string | null;
  lastName: string | null;
  externalId: string | null;
  approvalDate: string | null;
  claimTypeLabel: string | null;
  totalFeesExpected: string | number | null;
  totalFeesPaid: string | number | null;
  t16Retro: string | number | null;
  t2Retro: string | number | null;
  auxRetro: string | number | null;
  assignedTo: string | null;
  noa: boolean | null;
  timeDelineation: boolean | null;
  feePetitionDoc: boolean | null;
  ltrToClmt: boolean | null;
  ltrToClmtWithSignature: boolean | null;
  ltrToAlj: boolean | null;
  faxConfFeePet: boolean | null;
  feePetitionApproved: boolean | null;
  updateNote: string | null;
  nextFollowUpDate: string | null;
  feePetitionUuid: string | null;
  updatedAt: Date | null;
};

const toFeePetitionRow = (r: FeePetitionQueryRow) => ({
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
  feePetitionApproved: r.feePetitionApproved ?? false,
  updateNote: r.updateNote ?? "",
  nextFollowUpDate: r.nextFollowUpDate ?? null,
  // logCount and recentUpdate are merged in after the batch log-stats query
  logCount: 0,
  recentUpdate: null as string | null,
});

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
    const guard = await requirePageAccess("fee_petitions");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const { searchParams } = new URL(req.url);

    // Per-row refresh (Fee Petitions table) — bypasses list filters like
    // search/status/touched/missing/aging/assignedTo and pagination, since
    // the caller already knows which row it wants and just needs its
    // current server state after an edit. Still scoped to the same
    // Fee Petition / not-closed universe as the list query, though, so this
    // can't be used to pull fee-petition-shaped data for an arbitrary case.
    const caseIdParam = searchParams.get("caseId");
    if (caseIdParam) {
      const caseId = parseInt(caseIdParam, 10);
      if (!Number.isFinite(caseId)) {
        return NextResponse.json({ error: "Invalid caseId" }, { status: 400 });
      }
      const [r] = await db
        .select(ROW_COLUMNS)
        .from(cases)
        .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
        .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
        .where(sql`${cases.clientId} = ${caseId}
          AND ${cases.levelWon} IN ('FEE_PETITION', 'FEE PETITION')
          AND (${feeRecords.isClosed} IS NULL OR ${feeRecords.isClosed} = false)`)
        .limit(1);
      if (!r) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 });
      }
      return NextResponse.json({ data: [toFeePetitionRow(r)] });
    }

    const search = searchParams.get("search");
    const status = searchParams.get("status"); // "complete" | "incomplete"
    const touched = searchParams.get("touched"); // "none" = no fee_petitions row yet
    const missing = searchParams.get("missing"); // checkbox key to filter by
    const aging = searchParams.get("aging"); // "unpaid_60" | "unpaid_90"
    const assignedTo = searchParams.get("assignedTo"); // fee petition specialist name
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

    // A petition moves to "Completed Petitions" once staff check Fee
    // Petition Approved — not tied to the filing checklist or fees received.
    // Once approved, staff change the case's Level away from FEE_PETITION
    // (removing it from this page entirely); Completed Petitions is the
    // holding view of "approved, ready to move to Master Fee Records."
    // The 6-item filing checklist still drives the per-row progress badge
    // (via progressExpr below) but no longer gates section membership.
    const isApproved = sql`COALESCE(${feePetitions.feePetitionApproved}, false)`;

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
        ? sql`AND ${isApproved}`
        : status === "incomplete"
          ? sql`AND NOT ${isApproved}`
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

    // Single aggregate for count and fee total. Sums across the FULL
    // filtered set (not just the current page) so they stay accurate
    // regardless of pagination.
    const [agg] = await db
      .select({
        total: sql<number>`COUNT(*)::int`,
        completeCount: sql<number>`COUNT(*) FILTER (WHERE ${isApproved})::int`,
        totalFeeRequested: sql<number>`COALESCE(SUM(${feeRecords.totalFeesExpected}), 0)::numeric`,
      })
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(whereClause);

    const total = agg?.total ?? 0;
    const completeCount = agg?.completeCount ?? 0;
    const totalFeeRequested = Number(agg?.totalFeeRequested) || 0;

    const orderClause =
      sort === "claimant"
        ? sql`${cases.lastName} ${dir} NULLS LAST, ${cases.firstName} ${dir} NULLS LAST`
        : sort === "updatedAt"
          ? sql`${feePetitions.updatedAt} ${dir} NULLS LAST`
          : sort === "progress"
            ? sql`${progressExpr} ${dir} NULLS LAST`
            : sort === "approvalDate"
              ? sql`${cases.approvalDate} ${dir} NULLS LAST`
              : sql`${cases.createdAt} ${dir} NULLS LAST`;

    const rows = await db
      .select(ROW_COLUMNS)
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    const data = rows.map(toFeePetitionRow);

    // Batch-fetch log stats (count + most recent message) for rows that have
    // a fee_petitions record. Rows never touched by staff have no UUID yet and
    // keep the default logCount=0 / recentUpdate=null from toFeePetitionRow.
    const petitionUuids = rows
      .map((r) => r.feePetitionUuid)
      .filter((id): id is string => id != null);

    if (petitionUuids.length > 0) {
      const [countRows, recentRows] = await Promise.all([
        db
          .select({
            feePetitionId: activityLog.feePetitionId,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(activityLog)
          .where(inArray(activityLog.feePetitionId, petitionUuids))
          .groupBy(activityLog.feePetitionId),
        db.execute(sql`
          SELECT fee_petition_id::text, message
          FROM (
            SELECT fee_petition_id, message,
                   ROW_NUMBER() OVER (PARTITION BY fee_petition_id ORDER BY created_at DESC) AS rn
            FROM activity_log
            WHERE fee_petition_id = ANY(ARRAY[${sql.join(petitionUuids.map((id) => sql`${id}`), sql`, `)}]::uuid[])
          ) ranked
          WHERE rn = 1
        `),
      ]);

      const countMap = new Map(countRows.map((r) => [r.feePetitionId, r.count]));
      const recentMap = new Map(
        (recentRows as unknown as { fee_petition_id: string; message: string }[]).map((r) => [
          r.fee_petition_id,
          r.message,
        ]),
      );

      for (const row of data) {
        const uuid = rows.find((r) => r.clientId === row.id)?.feePetitionUuid;
        if (!uuid) continue;
        row.logCount = countMap.get(uuid) ?? 0;
        row.recentUpdate = recentMap.get(uuid) ?? null;
      }
    }

    return NextResponse.json({
      data,
      page,
      limit,
      total,
      completeCount,
      totalFeeRequested,
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
