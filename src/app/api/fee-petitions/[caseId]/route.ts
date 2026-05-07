import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { feePetitions } from "@/lib/db/schema";

const resolveParams = async (context: {
  params: { caseId: string } | Promise<{ caseId: string }>;
}) => {
  const p =
    context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.caseId);
};

// PATCH /api/fee-petitions/[caseId] — Upsert checklist + note for a case
export const PATCH = async (
  req: NextRequest,
  context: { params: { caseId: string } | Promise<{ caseId: string }> },
) => {
  try {
    const caseId = await resolveParams(context);
    if (isNaN(caseId)) {
      return NextResponse.json({ error: "Invalid case ID" }, { status: 400 });
    }

    const body = await req.json();

    // Whitelist editable fields, drop everything else
    const FIELD_KEYS = [
      "noa",
      "timeDelineation",
      "feePetitionDoc",
      "ltrToClmt",
      "ltrToClmtWithSignature",
      "ltrToAlj",
      "faxConfFeePet",
      "updateNote",
    ] as const;

    const updates: Partial<typeof feePetitions.$inferInsert> = {};
    for (const key of FIELD_KEYS) {
      if (key in body) {
        (updates as Record<string, unknown>)[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    // Upsert: insert defaults if no row exists, otherwise update only the given fields
    const [row] = await db
      .insert(feePetitions)
      .values({ caseId, ...updates })
      .onConflictDoUpdate({
        target: feePetitions.caseId,
        set: { ...updates, updatedAt: new Date() },
      })
      .returning();

    return NextResponse.json({ status: "ok", data: row });
  } catch (error) {
    console.error("PATCH /api/fee-petitions/[caseId] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
