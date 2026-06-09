import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feeRecords } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { caseIds, markedOverpaid } = body;

    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json({ error: "No case IDs provided" }, { status: 400 });
    }
    if (caseIds.length > 500) {
      return NextResponse.json({ error: "Too many cases (max 500)" }, { status: 400 });
    }
    if (!caseIds.every((id: unknown) => Number.isFinite(id))) {
      return NextResponse.json({ error: "Invalid case IDs" }, { status: 400 });
    }

    await db
      .update(feeRecords)
      .set({ markedOverpaid: Boolean(markedOverpaid), updatedAt: new Date() })
      .where(inArray(feeRecords.caseId, caseIds));

    return NextResponse.json({ status: "ok", updated: caseIds.length });
  } catch (error) {
    console.error("POST /api/cases/bulk-overpaid error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
