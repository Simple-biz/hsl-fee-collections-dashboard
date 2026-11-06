import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { cases, feeRecords, referrals } from "@/lib/db/schema";
import { eq, ilike, desc, or, sql, and, isNull, isNotNull } from "drizzle-orm";
import { requireCapability, guardStatus } from "@/lib/auth-helpers";

const markPaidSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  paid: z.boolean(),
  paymentAmount: z.coerce.number().positive().nullable().optional(),
});

// GET /api/referrals?search=&page=&limit=
export const GET = async (req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const paidParam = searchParams.get("paid");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        caseId: referrals.caseId,
        referredBy: referrals.referredBy,
        notes: referrals.notes,
        paidAt: referrals.paidAt,
        paymentAmount: referrals.paymentAmount,
        createdAt: referrals.createdAt,
        firstName: cases.firstName,
        lastName: cases.lastName,
        claimTypeLabel: cases.claimTypeLabel,
        approvalDate: cases.approvalDate,
        assignedTo: feeRecords.assignedTo,
        isClosed: feeRecords.isClosed,
        totalFeesPaid: feeRecords.totalFeesPaid,
        pifReadyToClose: feeRecords.pifReadyToClose,
      })
      .from(referrals)
      .innerJoin(cases, eq(cases.clientId, referrals.caseId))
      .leftJoin(feeRecords, eq(feeRecords.caseId, referrals.caseId))
      .where(
        and(
          paidParam === "true"
            ? isNotNull(referrals.paidAt)
            : paidParam === "false"
              ? isNull(referrals.paidAt)
              : undefined,
          search
            ? or(
                ilike(cases.firstName, `%${search}%`),
                ilike(cases.lastName, `%${search}%`),
                ilike(referrals.referredBy, `%${search}%`),
                sql`(${cases.firstName} || ' ' || ${cases.lastName}) ILIKE ${'%' + search + '%'}`,
                sql`(${cases.lastName} || ', ' || ${cases.firstName}) ILIKE ${'%' + search + '%'}`,
              )
            : undefined,
        ),
      )
      .orderBy(desc(referrals.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/referrals error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

const addReferralSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  referredBy: z.string().trim().min(1, "Referrer name is required").max(200),
  notes: z.string().trim().max(5000).optional(),
});

// POST /api/referrals — add an existing case to referrals
export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireCapability("case.update");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });
    }

    const parsed = addReferralSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { caseId, referredBy, notes } = parsed.data;

    // Verify the case exists before inserting.
    const [existing] = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.clientId, caseId))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const [row] = await db
      .insert(referrals)
      .values({ caseId, referredBy, notes: notes ?? "" })
      .onConflictDoUpdate({
        target: referrals.caseId,
        set: { referredBy, notes: notes ?? "", updatedAt: new Date() },
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (error) {
    console.error("POST /api/referrals error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

// PATCH /api/referrals — mark a referral paid or unpaid
export const PATCH = async (req: NextRequest) => {
  try {
    const guard = await requireCapability("case.update");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guardStatus(guard.error) });
    }

    const parsed = markPaidSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { caseId, paid, paymentAmount } = parsed.data;

    const [existing] = await db
      .select({ caseId: referrals.caseId })
      .from(referrals)
      .where(eq(referrals.caseId, caseId))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }

    const [row] = await db
      .update(referrals)
      .set({
        paidAt: paid ? new Date() : null,
        paymentAmount: paid && paymentAmount != null ? String(paymentAmount) : null,
        updatedAt: new Date(),
      })
      .where(eq(referrals.caseId, caseId))
      .returning();

    return NextResponse.json({ data: row });
  } catch (error) {
    console.error("PATCH /api/referrals error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
