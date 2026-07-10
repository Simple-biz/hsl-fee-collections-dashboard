import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dropdownOptions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

const resolveId = async (context: {
  params: { id: string } | Promise<{ id: string }>;
}) => {
  const p =
    context.params instanceof Promise ? await context.params : context.params;
  return parseInt(p.id);
};

type UpdatePatch = {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
  updatedAt: Date;
};

// PATCH /api/settings/dropdown-options/[id] — rename, toggle active, reorder.
// Category is intentionally immutable; create a new row in the right category
// instead of moving an existing one.
export const PATCH = async (
  req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const id = await resolveId(context);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const updates: UpdatePatch = { updatedAt: new Date() };

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 150) {
        return NextResponse.json({ error: "Invalid name" }, { status: 400 });
      }
      updates.name = name;
    }
    if (typeof body?.isActive === "boolean") updates.isActive = body.isActive;
    if (typeof body?.sortOrder === "number") updates.sortOrder = body.sortOrder;

    // Only `updatedAt` was set → nothing real to change.
    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const [row] = await db
      .update(dropdownOptions)
      .set(updates)
      .where(eq(dropdownOptions.id, id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: row });
  } catch (error) {
    // 23505 = postgres unique_violation (duplicate category+name).
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "An option with that name already exists in this category" },
        { status: 409 },
      );
    }
    console.error("PATCH /api/settings/dropdown-options/[id] error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

// DELETE /api/settings/dropdown-options/[id]
export const DELETE = async (
  _req: NextRequest,
  context: { params: { id: string } | Promise<{ id: string }> },
) => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const id = await resolveId(context);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await db.delete(dropdownOptions).where(eq(dropdownOptions.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/settings/dropdown-options/[id] error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
