import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamMembers, feeRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/team-members — List team members with case counts + collected totals
export const GET = async () => {
  try {
    const rows = await db
      .select({
        name: teamMembers.name,
        role: teamMembers.role,
        cases: sql<number>`COUNT(${feeRecords.id})`,
        collected: sql<number>`COALESCE(SUM(${feeRecords.totalFeesPaid}::numeric), 0)`,
      })
      .from(teamMembers)
      .leftJoin(feeRecords, eq(feeRecords.assignedTo, teamMembers.name))
      .where(eq(teamMembers.isActive, true))
      .groupBy(teamMembers.name, teamMembers.role);

    const data = rows.map((r) => ({
      name: r.name,
      role: r.role || "Collections Specialist",
      cases: Number(r.cases),
      collected: `$${Number(r.collected).toLocaleString()}`,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/team-members error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
