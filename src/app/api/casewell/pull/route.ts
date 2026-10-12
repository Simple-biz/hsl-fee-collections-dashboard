import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userDetails } from "@/lib/db/schema";
import {
  getClient,
  getClientDocuments,
  parseCasewellClient,
} from "@/lib/casewell-client";
import { requirePageAccess, guardStatus } from "@/lib/auth-helpers";

const pullBodySchema = z.object({
  casewellId: z
    .string()
    .min(1)
    .max(20)
    .regex(/^\d+$/, "casewellId must be numeric"),
});

// POST /api/casewell/pull — Fetch single Casewell case with documents.
// Body: { casewellId: "26539" }
export const POST = async (req: NextRequest) => {
  try {
    const guard = await requirePageAccess("casewell");
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guardStatus(guard.error) },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = pullBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { casewellId } = parsed.data;

    const [detail, docList] = await Promise.all([
      getClient(casewellId),
      getClientDocuments(casewellId).catch(() => null),
    ]);

    const parsedCase = parseCasewellClient(detail);

    // Check if this Casewell ID is already linked to a case in our DB.
    const existing = await db
      .select({ caseId: userDetails.caseId })
      .from(userDetails)
      .where(eq(userDetails.casewellId, casewellId))
      .limit(1);

    return NextResponse.json({
      status: "ok",
      parsed: parsedCase,
      documents: docList?.case_documents ?? [],
      exhibitCount: docList?.exhibits?.length ?? 0,
      existsInDb: existing.length > 0,
      matchedCaseId: existing[0]?.caseId ?? null,
    });
  } catch (error) {
    console.error("POST /api/casewell/pull error:", error);
    const msg = (error as Error).message;
    const statusMatch = msg.match(/Casewell API error: (\d{3}) /);
    const apiStatus = statusMatch ? Number(statusMatch[1]) : 0;
    const status =
      apiStatus === 404
        ? 404
        : apiStatus === 401 || msg.includes("API key")
          ? 401
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
};
