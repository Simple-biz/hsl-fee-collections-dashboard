import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const week = searchParams.get("week") ?? new Date().toISOString().split("T")[0];

    const monday = new Date(week + "T00:00:00");
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const to = sunday.toISOString().split("T")[0];

    const rows = await db.execute(sql`
      SELECT
        al.id,
        al.case_id            AS "caseId",
        al.message,
        al.created_by         AS "createdBy",
        al.created_at         AS "createdAt",
        c.last_name           AS "lastName",
        c.first_name          AS "firstName"
      FROM activity_log al
      LEFT JOIN cases c ON c.client_id = al.case_id
      WHERE al.created_at >= ${week}::date
        AND al.created_at < (${to}::date + interval '1 day')
      ORDER BY al.created_at DESC
      LIMIT 300
    `);

    return NextResponse.json({
      data: (
        rows as unknown as {
          id: string;
          caseId: number;
          message: string;
          createdBy: string | null;
          createdAt: string;
          lastName: string | null;
          firstName: string | null;
        }[]
      ).map((r) => ({
        id: r.id,
        caseId: r.caseId,
        message: r.message,
        createdBy: r.createdBy ?? "Unknown",
        createdAt: r.createdAt,
        caseName:
          r.lastName && r.firstName ? `${r.lastName}, ${r.firstName}` : null,
      })),
    });
  } catch (err) {
    console.error("GET /api/activity-log error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
