import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feePetitions } from "@/lib/db/schema";
import { eq, ilike, sql, desc } from "drizzle-orm";

// GET /api/fee-petitions?page=&limit=&search= — List cases at FEE_PETITION level with checklist state
export const GET = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status"); // "complete" | "incomplete" | null
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // All 7 checklist fields true (NULLs from LEFT JOIN coalesce to false)
    const allChecked = sql`(
      COALESCE(${feePetitions.noa}, false)
      AND COALESCE(${feePetitions.timeDelineation}, false)
      AND COALESCE(${feePetitions.feePetitionDoc}, false)
      AND COALESCE(${feePetitions.ltrToClmt}, false)
      AND COALESCE(${feePetitions.ltrToClmtWithSignature}, false)
      AND COALESCE(${feePetitions.ltrToAlj}, false)
      AND COALESCE(${feePetitions.faxConfFeePet}, false)
    )`;

    const statusClause =
      status === "complete"
        ? sql`AND ${allChecked}`
        : status === "incomplete"
          ? sql`AND NOT ${allChecked}`
          : sql``;

    const whereClause = sql`${cases.levelWon} = 'FEE_PETITION'
      ${search ? sql`AND (${ilike(cases.firstName, `%${search}%`)} OR ${ilike(cases.lastName, `%${search}%`)} OR ${ilike(cases.externalId, `%${search}%`)})` : sql``}
      ${statusClause}
    `;

    // Total count (respecting filter) — must left-join to evaluate status
    const totalRows = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .where(whereClause);
    const total = totalRows[0]?.count ?? 0;

    // Page rows: cases left-joined with fee_petitions
    const rows = await db
      .select({
        clientId: cases.clientId,
        firstName: cases.firstName,
        lastName: cases.lastName,
        approvalDate: cases.approvalDate,

        noa: feePetitions.noa,
        timeDelineation: feePetitions.timeDelineation,
        feePetitionDoc: feePetitions.feePetitionDoc,
        ltrToClmt: feePetitions.ltrToClmt,
        ltrToClmtWithSignature: feePetitions.ltrToClmtWithSignature,
        ltrToAlj: feePetitions.ltrToAlj,
        faxConfFeePet: feePetitions.faxConfFeePet,
        updateNote: feePetitions.updateNote,
      })
      .from(cases)
      .leftJoin(feePetitions, eq(feePetitions.caseId, cases.clientId))
      .where(whereClause)
      .orderBy(desc(cases.approvalDate))
      .limit(limit)
      .offset(offset);

    const data = rows.map((r) => ({
      id: r.clientId,
      claimant: `${r.lastName}, ${r.firstName}`,
      noa: r.noa ?? false,
      timeDelineation: r.timeDelineation ?? false,
      feePetitionDoc: r.feePetitionDoc ?? false,
      ltrToClmt: r.ltrToClmt ?? false,
      ltrToClmtWithSignature: r.ltrToClmtWithSignature ?? false,
      ltrToAlj: r.ltrToAlj ?? false,
      faxConfFeePet: r.faxConfFeePet ?? false,
      updateNote: r.updateNote ?? "",
    }));

    return NextResponse.json({ data, page, limit, total });
  } catch (error) {
    console.error("GET /api/fee-petitions error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
