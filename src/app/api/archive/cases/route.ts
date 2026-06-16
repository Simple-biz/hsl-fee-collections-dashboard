import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { cases, feeRecords, caseArchive } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export const GET = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const url = new URL(req.url);
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(parseInt(limitParam ?? "", 10) || 500, 1000);

    const rows = await db
      .select({
        id: caseArchive.id,
        originalClientId: caseArchive.originalClientId,
        caseName: caseArchive.caseName,
        caseLink: caseArchive.caseLink,
        approvalDate: caseArchive.approvalDate,
        archivedSource: caseArchive.archivedSource,
        archivedAt: caseArchive.archivedAt,
        archivedBy: caseArchive.archivedBy,
      })
      .from(caseArchive)
      .orderBy(desc(caseArchive.archivedAt))
      .limit(limit);

    return NextResponse.json({ data: rows, total: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};

const bodySchema = z.object({
  clientIds: z.array(z.number().int().positive()).min(1),
  source: z.enum(["active_sheet", "fees_closed_sheet"]),
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

    const archivedBy =
      guard.session.user.name ?? guard.session.user.email ?? "unknown";

    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { clientIds, source } = body;

    const caseRows = await db
      .select()
      .from(cases)
      .where(inArray(cases.clientId, clientIds));

    const feeRows = await db
      .select()
      .from(feeRecords)
      .where(inArray(feeRecords.caseId, clientIds));

    const feeByClientId = new Map(feeRows.map((r) => [r.caseId, r]));

    const archiveInserts = caseRows.map((c) => ({
      originalClientId: c.clientId,
      caseName: `${c.lastName}, ${c.firstName}`,
      caseLink: c.caseLink,
      approvalDate: c.approvalDate,
      archivedSource: source,
      archivedBy,
      caseSnapshot: c as Record<string, unknown>,
      feeRecordSnapshot: (feeByClientId.get(c.clientId) ?? null) as Record<string, unknown> | null,
    }));

    await db.transaction(async (tx) => {
      if (archiveInserts.length > 0) {
        await tx.insert(caseArchive).values(archiveInserts);
      }
      await tx.delete(cases).where(inArray(cases.clientId, clientIds));
    });

    return NextResponse.json({ archived: archiveInserts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
};
