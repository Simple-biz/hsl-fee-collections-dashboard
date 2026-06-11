import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { myCaseSyncTags } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import { auth } from "@/auth";

// POST /api/mycase/sync/tags
// body: { myCaseCaseIds: number[], tag?: string }
// Tags one or more MyCase case IDs (default tag: "viewed").
export const POST = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const session = await auth();
    const taggedBy = session?.user?.email ?? null;

    const body = (await req.json()) as { myCaseCaseIds: unknown; tag?: unknown };
    if (!Array.isArray(body.myCaseCaseIds) || body.myCaseCaseIds.length === 0) {
      return NextResponse.json({ error: "myCaseCaseIds must be a non-empty array" }, { status: 400 });
    }

    const ids = (body.myCaseCaseIds as unknown[]).map(Number).filter(Number.isFinite);
    const tag = typeof body.tag === "string" && body.tag.trim() ? body.tag.trim() : "viewed";

    await db
      .insert(myCaseSyncTags)
      .values(ids.map((id) => ({ myCaseCaseId: id, tag, taggedBy })))
      .onConflictDoUpdate({
        target: myCaseSyncTags.myCaseCaseId,
        set: { tag, taggedBy, taggedAt: new Date() },
      });

    return NextResponse.json({ tagged: ids.length });
  } catch (err) {
    console.error("POST /api/mycase/sync/tags error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
};

// DELETE /api/mycase/sync/tags
// body: { myCaseCaseIds: number[] }
// Removes tags from the given MyCase case IDs.
export const DELETE = async (req: NextRequest) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const body = (await req.json()) as { myCaseCaseIds: unknown };
    if (!Array.isArray(body.myCaseCaseIds) || body.myCaseCaseIds.length === 0) {
      return NextResponse.json({ error: "myCaseCaseIds must be a non-empty array" }, { status: 400 });
    }

    const ids = (body.myCaseCaseIds as unknown[]).map(Number).filter(Number.isFinite);

    await db.delete(myCaseSyncTags).where(inArray(myCaseSyncTags.myCaseCaseId, ids));

    return NextResponse.json({ untagged: ids.length });
  } catch (err) {
    console.error("DELETE /api/mycase/sync/tags error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
};
