import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";

// GET /api/dashboard — Summary stats + monthly collections data
export const GET = async () => {
  try {
    // Summary stats from the view (or computed here)
    const [stats] = await db
      .select({
        totalCases: count(),
        feesComputed: count(
          sql`CASE WHEN ${feeRecords.feeComputed} = TRUE THEN 1 END`,
        ),
        pif: count(
          sql`CASE WHEN ${feeRecords.pifReadyToClose} = TRUE THEN 1 END`,
        ),
        synced: count(
          sql`CASE WHEN ${feeRecords.syncStatus} = 'synced' THEN 1 END`,
        ),
        syncErrors: count(
          sql`CASE WHEN ${feeRecords.syncStatus} = 'error' THEN 1 END`,
        ),
        totalExpected: sql<number>`COALESCE(SUM(${feeRecords.totalFeesExpected}::numeric), 0)`,
        totalPaid: sql<number>`COALESCE(SUM(${feeRecords.totalFeesPaid}::numeric), 0)`,
      })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId));

    const expected = Number(stats.totalExpected);
    const paid = Number(stats.totalPaid);

    // Monthly collections data (last 6 months)
    const monthly = await db.execute(sql`
      SELECT
        TO_CHAR(c.approval_date, 'Mon') AS month,
        TO_CHAR(c.approval_date, 'YYYY-MM') AS sort_key,
        COALESCE(SUM(f.total_fees_expected::numeric), 0) AS expected,
        COALESCE(SUM(f.total_fees_paid::numeric), 0) AS collected
      FROM cases c
      LEFT JOIN fee_records f ON f.case_id = c.client_id
      WHERE c.approval_date IS NOT NULL
        AND c.approval_date >= (CURRENT_DATE - INTERVAL '6 months')
      GROUP BY TO_CHAR(c.approval_date, 'Mon'), TO_CHAR(c.approval_date, 'YYYY-MM')
      ORDER BY sort_key ASC
    `);

    const monthlyData = monthly.map((row: any) => ({
      month: row.month,
      expected: Number(row.expected),
      collected: Number(row.collected),
    }));

    return NextResponse.json({
      summary: {
        totalCases: stats.totalCases,
        expected,
        paid,
        outstanding: expected - paid,
        pif: stats.pif,
        syncErrors: stats.syncErrors,
        synced: stats.synced,
      },
      monthlyData,
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
