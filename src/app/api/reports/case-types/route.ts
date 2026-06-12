import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// GET /api/reports/case-types
export const GET = async () => {
  const guard = await requireAdmin();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 });

  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE 'T16' = ANY(claim_type) AND 'T2' = ANY(claim_type))::int  AS concurrent,
        COUNT(*) FILTER (WHERE 'T16' = ANY(claim_type) AND NOT ('T2' = ANY(claim_type)))::int AS t16_only,
        COUNT(*) FILTER (WHERE 'T2'  = ANY(claim_type) AND NOT ('T16' = ANY(claim_type)))::int AS t2_only,
        COUNT(*) FILTER (WHERE 'T16' = ANY(claim_type) OR 'T2' = ANY(claim_type))::int AS total
      FROM cases
    `);
    const [row] = result as unknown as {
      concurrent: number;
      t16_only: number;
      t2_only: number;
      total: number;
    }[];
    return NextResponse.json({
      concurrent: Number(row.concurrent),
      t16Only: Number(row.t16_only),
      t2Only: Number(row.t2_only),
      total: Number(row.total),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
};
