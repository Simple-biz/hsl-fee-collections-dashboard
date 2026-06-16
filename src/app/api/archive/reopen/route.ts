import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { cases, feeRecords, caseArchive } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

export const runtime = "nodejs";

const bodySchema = z.object({
  archiveId: z.string().uuid(),
  destination: z.enum(["master_list", "fees_closed"]),
});

export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { archiveId, destination } = body;

    const archiveRows = await db
      .select()
      .from(caseArchive)
      .where(eq(caseArchive.id, archiveId));

    if (archiveRows.length === 0) {
      return NextResponse.json({ error: "Archive record not found" }, { status: 404 });
    }

    const archiveRow = archiveRows[0];

    const existing = await db
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.clientId, archiveRow.originalClientId));

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Client ${archiveRow.originalClientId} already exists in the database` },
        { status: 409 },
      );
    }

    const caseSnap = archiveRow.caseSnapshot as Record<string, unknown>;
    const feeSnap = archiveRow.feeRecordSnapshot as Record<string, unknown> | null;

    // Strip DB-managed serial PK and auto timestamps — DB will re-assign them.
    const skipCase = new Set(["id", "createdAt", "updatedAt"]);
    const caseInsert = Object.fromEntries(
      Object.entries(caseSnap).filter(([k]) => !skipCase.has(k)),
    );

    let feeInsert: Record<string, unknown> | null = null;
    if (feeSnap) {
      const skipFee = new Set(["id", "caseId", "createdAt", "updatedAt"]);
      const feeBase = Object.fromEntries(
        Object.entries(feeSnap).filter(([k]) => !skipFee.has(k)),
      );
      feeInsert = {
        ...feeBase,
        caseId: archiveRow.originalClientId,
        isClosed: destination === "fees_closed",
        closedAt: destination === "fees_closed" ? new Date() : null,
        ...(destination === "fees_closed" ? { winSheetStatus: "closed" } : {}),
      };
    }

    await db.transaction(async (tx) => {
      await tx.insert(cases).values(caseInsert as unknown as typeof cases.$inferInsert);
      if (feeInsert) {
        await tx.insert(feeRecords).values(feeInsert as unknown as typeof feeRecords.$inferInsert);
      }
      await tx.delete(caseArchive).where(eq(caseArchive.id, archiveId));
    });

    return NextResponse.json({ restored: 1, destination });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
