import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { feePayments, feeRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session.user?.role;
  const isAdmin = role === "admin" || role === "system_admin";
  const isLead = role === "lead";
  if (!isAdmin && !isLead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [deleted] = await db
    .delete(feePayments)
    .where(eq(feePayments.id, id))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const amount = Number(deleted.amount);
  const feeType = deleted.feeType;

  // Subtract from the denormalized total; floor at 0 to guard against drift.
  const setValues =
    feeType === "t16"
      ? {
          t16FeeReceived: sql`GREATEST(0, ${feeRecords.t16FeeReceived} - ${String(amount)}::numeric)`,
          updatedAt: new Date(),
        }
      : feeType === "t2"
        ? {
            t2FeeReceived: sql`GREATEST(0, ${feeRecords.t2FeeReceived} - ${String(amount)}::numeric)`,
            updatedAt: new Date(),
          }
        : {
            auxFeeReceived: sql`GREATEST(0, ${feeRecords.auxFeeReceived} - ${String(amount)}::numeric)`,
            updatedAt: new Date(),
          };

  await db.update(feeRecords).set(setValues).where(eq(feeRecords.caseId, deleted.caseId));

  return NextResponse.json({ deleted: true });
}
