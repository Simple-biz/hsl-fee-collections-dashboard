import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cases, feeRecords } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";

// GET /api/dashboard — Summary stats + monthly collections data
export const GET = async () => {
  try {
    // Summary stats (active rows only — closed cases live on /fees-closed).
    // expected/paid are computed from the per-benefit subtotals (T16 + T2 +
    // AUX) instead of the stored `total_fees_expected`/`total_fees_paid`,
    // which the xlsx import path does not populate — so the cards stay
    // accurate regardless of whether the aggregate columns were filled.
    const [stats] = await db
      .select({
        totalCases: count(),
        pif: count(
          sql`CASE WHEN ${feeRecords.pifReadyToClose} = TRUE THEN 1 END`,
        ),
        synced: count(
          sql`CASE WHEN ${feeRecords.syncStatus} = 'synced' THEN 1 END`,
        ),
        syncErrors: count(
          sql`CASE WHEN ${feeRecords.syncStatus} = 'error' THEN 1 END`,
        ),
        totalExpected: sql<number>`COALESCE(SUM(
          COALESCE(${feeRecords.t16FeeDue}, 0)::numeric
          + COALESCE(${feeRecords.t2FeeDue}, 0)::numeric
          + COALESCE(${feeRecords.auxFeeDue}, 0)::numeric
        ), 0)`,
        totalPaid: sql<number>`COALESCE(SUM(
          COALESCE(${feeRecords.t16FeeReceived}, 0)::numeric
          + COALESCE(${feeRecords.t2FeeReceived}, 0)::numeric
          + COALESCE(${feeRecords.auxFeeReceived}, 0)::numeric
        ), 0)`,
      })
      .from(cases)
      .leftJoin(feeRecords, eq(feeRecords.caseId, cases.clientId))
      .where(sql`COALESCE(${feeRecords.isClosed}, false) = false`);

    const expected = Number(stats.totalExpected);
    const paid = Number(stats.totalPaid);

    // Monthly collections data (last 6 months). Same dataset as the summary
    // above — closed cases excluded, totals computed from T16+T2+AUX
    // subtotals — so the chart and the cards never drift apart.
    const monthly = await db.execute(sql`
      SELECT
        TO_CHAR(c.approval_date, 'Mon') AS month,
        TO_CHAR(c.approval_date, 'YYYY-MM') AS sort_key,
        COALESCE(SUM(
          COALESCE(f.t16_fee_due, 0)::numeric
          + COALESCE(f.t2_fee_due, 0)::numeric
          + COALESCE(f.aux_fee_due, 0)::numeric
        ), 0) AS expected,
        COALESCE(SUM(
          COALESCE(f.t16_fee_received, 0)::numeric
          + COALESCE(f.t2_fee_received, 0)::numeric
          + COALESCE(f.aux_fee_received, 0)::numeric
        ), 0) AS collected
      FROM cases c
      LEFT JOIN fee_records f ON f.case_id = c.client_id
      WHERE c.approval_date IS NOT NULL
        AND c.approval_date >= (CURRENT_DATE - INTERVAL '6 months')
        AND COALESCE(f.is_closed, false) = false
      GROUP BY TO_CHAR(c.approval_date, 'Mon'), TO_CHAR(c.approval_date, 'YYYY-MM')
      ORDER BY sort_key ASC
    `);

    const monthlyData = (
      monthly as unknown as {
        month: string;
        expected: string;
        collected: string;
      }[]
    ).map((row) => ({
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
