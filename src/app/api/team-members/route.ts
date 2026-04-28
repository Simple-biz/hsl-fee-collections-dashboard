import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamMembers, feeRecords } from "@/lib/db/schema";
import { eq, sql, count, sum, and } from "drizzle-orm";

// GET /api/team-members — list all team members with case stats
export const GET = async () => {
  try {
    const rows = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        role: teamMembers.role,
        isActive: teamMembers.isActive,
        createdAt: teamMembers.createdAt,
        caseCount: count(feeRecords.id),
        totalCollected: sum(sql`${feeRecords.totalFeesPaid}::numeric`),
        activeCases: count(
          sql`CASE WHEN ${feeRecords.winSheetStatus} NOT IN ('paid_in_full', 'closed') THEN 1 END`,
        ),
        pifCases: count(
          sql`CASE WHEN ${feeRecords.winSheetStatus} = 'paid_in_full' THEN 1 END`,
        ),
      })
      .from(teamMembers)
      .leftJoin(feeRecords, eq(feeRecords.assignedTo, teamMembers.name))
      .groupBy(
        teamMembers.id,
        teamMembers.name,
        teamMembers.role,
        teamMembers.isActive,
        teamMembers.createdAt,
      )
      .orderBy(teamMembers.name);

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      isActive: r.isActive,
      createdAt: r.createdAt,
      cases: Number(r.caseCount) || 0,
      collected: Number(r.totalCollected) || 0,
      activeCases: Number(r.activeCases) || 0,
      pifCases: Number(r.pifCases) || 0,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/team-members error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// POST /api/team-members — create new team member
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { name, role } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    const trimmedRole = (role || "collections_specialist").trim();

    // Check for duplicate
    const existing = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.name, trimmedName))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Team member "${trimmedName}" already exists` },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(teamMembers)
      .values({ name: trimmedName, role: trimmedRole })
      .returning();

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/team-members error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// PATCH /api/team-members — update team member
export const PATCH = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { id, name, role, isActive } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json(
        { error: "id (number) is required" },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (role !== undefined) updates.role = role.trim();
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    // If renaming, cascade to fee_records.assigned_to
    if (updates.name) {
      const [existing] = await db
        .select({ name: teamMembers.name })
        .from(teamMembers)
        .where(eq(teamMembers.id, id));

      if (!existing) {
        return NextResponse.json(
          { error: "Team member not found" },
          { status: 404 },
        );
      }

      if (existing.name !== updates.name) {
        // Check name conflict
        const conflict = await db
          .select({ id: teamMembers.id })
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.name, updates.name as string),
              sql`${teamMembers.id} != ${id}`,
            ),
          )
          .limit(1);

        if (conflict.length > 0) {
          return NextResponse.json(
            { error: `Name "${updates.name}" is already taken` },
            { status: 409 },
          );
        }

        // Cascade rename in fee_records
        await db
          .update(feeRecords)
          .set({ assignedTo: updates.name as string })
          .where(eq(feeRecords.assignedTo, existing.name));
      }
    }

    const [updated] = await db
      .update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PATCH /api/team-members error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// DELETE /api/team-members?id=X — soft-delete (deactivate)
export const DELETE = async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "id query param required" },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(teamMembers)
      .set({ isActive: false })
      .where(eq(teamMembers.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: updated,
      message: "Team member deactivated",
    });
  } catch (error) {
    console.error("DELETE /api/team-members error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
