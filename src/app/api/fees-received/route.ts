import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/fees-received?week=YYYY-MM-DD
// Returns fee payments entered during a Mon-Sun week, grouped by the day
// they were recorded in the system (feePayments.created_at), not receivedDate.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const week = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const rows = await db.execute(sql`
      SELECT
        fp.id::text AS id,
        fp.case_id AS case_id,
        c.first_name AS first_name,
        c.last_name AS last_name,
        c.external_id AS external_id,
        fp.fee_type AS fee_type,
        fp.amount::numeric AS amount,
        fp.received_date AS received_date,
        fp.created_at AS created_at,
        fr.assigned_to AS assigned_to
      FROM fee_payments fp
      JOIN cases c ON c.client_id = fp.case_id
      LEFT JOIN fee_records fr ON fr.case_id = fp.case_id
      WHERE fp.created_at >= ${week}::date
        AND fp.created_at < ${week}::date + INTERVAL '7 days'
      ORDER BY fp.created_at ASC
    `) as unknown as {
      id: string;
      case_id: number;
      first_name: string | null;
      last_name: string | null;
      external_id: string | null;
      fee_type: string;
      amount: string;
      received_date: string;
      created_at: string;
      assigned_to: string | null;
    }[];

    const payments = rows.map((r) => ({
      id: r.id,
      caseId: r.case_id,
      caseName: `${r.last_name ?? ""}, ${r.first_name ?? ""}`,
      externalId: r.external_id,
      feeType: r.fee_type,
      amount: Number(r.amount),
      receivedDate: r.received_date,
      assignedTo: r.assigned_to,
      createdAt: r.created_at,
      date: new Date(r.created_at).toISOString().split("T")[0],
    }));

    const totalByDate = new Map<string, number>();
    const countByDate = new Map<string, number>();
    for (const p of payments) {
      totalByDate.set(p.date, (totalByDate.get(p.date) ?? 0) + p.amount);
      countByDate.set(p.date, (countByDate.get(p.date) ?? 0) + 1);
    }

    const monday = new Date(`${week}T00:00:00Z`);
    const data = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().split("T")[0];
      return {
        date,
        total: totalByDate.get(date) ?? 0,
        count: countByDate.get(date) ?? 0,
      };
    });

    return NextResponse.json({ week, data, payments });
  } catch (error) {
    console.error("GET /api/fees-received error:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
