import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { feePayments, feeRecords } from "@/lib/db/schema";
import { and, eq, asc, sql } from "drizzle-orm";
import { z } from "zod";

const feeTypeValues = ["t16", "t2", "aux"] as const;

const addPaymentSchema = z.object({
  feeType: z.enum(feeTypeValues),
  amount: z.number().positive(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(200).optional(),
});

// GET /api/cases/[id]/payments?feeType=t16|t2|aux
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const caseId = parseInt(id, 10);
  if (isNaN(caseId)) return NextResponse.json({ error: "Invalid case id" }, { status: 400 });

  const url = new URL(_req.url);
  const feeTypeParam = url.searchParams.get("feeType");
  if (!feeTypeParam || !feeTypeValues.includes(feeTypeParam as (typeof feeTypeValues)[number])) {
    return NextResponse.json({ error: "Invalid feeType" }, { status: 400 });
  }
  const feeType = feeTypeParam as (typeof feeTypeValues)[number];

  const payments = await db
    .select({
      id: feePayments.id,
      caseId: feePayments.caseId,
      feeType: feePayments.feeType,
      amount: feePayments.amount,
      receivedDate: feePayments.receivedDate,
      note: feePayments.note,
      createdAt: feePayments.createdAt,
    })
    .from(feePayments)
    .where(and(eq(feePayments.caseId, caseId), eq(feePayments.feeType, feeType)))
    .orderBy(asc(feePayments.receivedDate), asc(feePayments.createdAt));

  return NextResponse.json({
    payments: payments.map((p) => ({
      ...p,
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
    })),
  });
}

// POST /api/cases/[id]/payments
export async function POST(
  req: NextRequest,
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
  const caseId = parseInt(id, 10);
  if (isNaN(caseId)) return NextResponse.json({ error: "Invalid case id" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = addPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 });
  }

  const { feeType, amount, receivedDate, note } = parsed.data;

  const [inserted] = await db
    .insert(feePayments)
    .values({ caseId, feeType, amount: String(amount), receivedDate, note: note ?? null })
    .returning();

  // Keep the denormalized total + most-recent-date on fee_records in sync.
  const setValues =
    feeType === "t16"
      ? {
          t16FeeReceived: sql`${feeRecords.t16FeeReceived} + ${String(amount)}::numeric`,
          t16FeeReceivedDate: receivedDate,
          updatedAt: new Date(),
        }
      : feeType === "t2"
        ? {
            t2FeeReceived: sql`${feeRecords.t2FeeReceived} + ${String(amount)}::numeric`,
            t2FeeReceivedDate: receivedDate,
            updatedAt: new Date(),
          }
        : {
            auxFeeReceived: sql`${feeRecords.auxFeeReceived} + ${String(amount)}::numeric`,
            auxFeeReceivedDate: receivedDate,
            updatedAt: new Date(),
          };

  await db.update(feeRecords).set(setValues).where(eq(feeRecords.caseId, caseId));

  return NextResponse.json({
    payment: {
      ...inserted,
      amount: Number(inserted.amount),
      createdAt: inserted.createdAt.toISOString(),
    },
  }, { status: 201 });
}
