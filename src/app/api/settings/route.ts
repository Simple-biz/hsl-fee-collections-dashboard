import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings, feeCapHistory } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

// ============================================================================
// GET /api/settings
// Returns all app settings (secrets are masked) + fee cap history
// ============================================================================
export const GET = async () => {
  try {
    const settings = await db
      .select()
      .from(appSettings)
      .orderBy(appSettings.category, appSettings.key);
    const feeCaps = await db
      .select()
      .from(feeCapHistory)
      .orderBy(desc(feeCapHistory.effectiveDate));

    // Mask secret values
    const masked = settings.map((s) => ({
      key: s.key,
      value: s.isSecret && s.value ? "••••••••" + s.value.slice(-4) : s.value,
      rawValue: s.isSecret ? undefined : s.value,
      label: s.label,
      category: s.category,
      isSecret: s.isSecret,
      updatedAt: s.updatedAt?.toISOString() || null,
    }));

    return NextResponse.json({
      settings: masked,
      feeCaps: feeCaps.map((fc) => ({
        id: fc.id,
        effectiveDate: fc.effectiveDate,
        capAmount: Number(fc.capAmount),
        notes: fc.notes,
        createdAt: fc.createdAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};

// ============================================================================
// PATCH /api/settings
// Body: { settings: { key: value, ... } }
//   or: { feeCap: { effectiveDate, capAmount, notes } }
//   or: { deleteFeeCap: id }
// ============================================================================
export const PATCH = async (req: NextRequest) => {
  try {
    const body = await req.json();

    // Update settings
    if (body.settings && typeof body.settings === "object") {
      const entries = Object.entries(body.settings) as [string, string][];
      for (const [key, value] of entries) {
        await db
          .update(appSettings)
          .set({ value: String(value), updatedAt: new Date() })
          .where(eq(appSettings.key, key));
      }
      return NextResponse.json({ status: "ok", updated: entries.length });
    }

    // Add fee cap
    if (body.feeCap) {
      const { effectiveDate, capAmount, notes } = body.feeCap;
      if (!effectiveDate || !capAmount) {
        return NextResponse.json(
          { error: "effectiveDate and capAmount required" },
          { status: 400 },
        );
      }
      const [row] = await db
        .insert(feeCapHistory)
        .values({
          effectiveDate,
          capAmount: String(capAmount),
          notes: notes || null,
        })
        .onConflictDoUpdate({
          target: feeCapHistory.effectiveDate,
          set: {
            capAmount: sql`EXCLUDED.cap_amount`,
            notes: sql`EXCLUDED.notes`,
          },
        })
        .returning();
      return NextResponse.json({ status: "ok", feeCap: row });
    }

    // Delete fee cap
    if (body.deleteFeeCap) {
      await db
        .delete(feeCapHistory)
        .where(eq(feeCapHistory.id, body.deleteFeeCap));
      return NextResponse.json({ status: "ok", deleted: body.deleteFeeCap });
    }

    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
};
