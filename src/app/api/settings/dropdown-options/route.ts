import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dropdownOptions } from "@/lib/db/schema";
import { isDropdownCategory } from "@/lib/dropdown-categories";

// GET /api/settings/dropdown-options?category=<key>
// Returns rows ordered by (sortOrder, name). When no category is provided,
// returns every row across all categories (used by admins for export / debug).
export const GET = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");

    if (category && !isDropdownCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const rows = await (category
      ? db
          .select()
          .from(dropdownOptions)
          .where(eq(dropdownOptions.category, category))
          .orderBy(dropdownOptions.sortOrder, dropdownOptions.name)
      : db
          .select()
          .from(dropdownOptions)
          .orderBy(
            dropdownOptions.category,
            dropdownOptions.sortOrder,
            dropdownOptions.name,
          ));

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("GET /api/settings/dropdown-options error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};

// POST /api/settings/dropdown-options — create a new option within a category.
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const category = String(body?.category ?? "").trim();
    const name = String(body?.name ?? "").trim();

    if (!isDropdownCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 150) {
      return NextResponse.json(
        { error: "Name too long (max 150)" },
        { status: 400 },
      );
    }

    const existing = await db
      .select({ id: dropdownOptions.id })
      .from(dropdownOptions)
      .where(
        and(
          eq(dropdownOptions.category, category),
          eq(dropdownOptions.name, name),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "An option with that name already exists in this category" },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(dropdownOptions)
      .values({ category, name })
      .returning();
    return NextResponse.json({ data: row });
  } catch (error) {
    console.error("POST /api/settings/dropdown-options error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
};
