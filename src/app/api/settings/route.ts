import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { appSettings, feeCapHistory } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const settingsValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const feeCapBodySchema = z.object({
  effectiveDate: z.string().regex(DATE_RE, "Invalid date (expected YYYY-MM-DD)"),
  capAmount: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0, "capAmount must be a positive number"),
  notes: z.string().trim().max(200).nullable().optional(),
});

// ============================================================================
// GET /api/settings
// Returns all app settings (secrets are masked) + fee cap history
// ============================================================================
export const GET = async () => {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

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
    const guard = await requireAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.error },
        { status: guard.error === "Unauthenticated" ? 401 : 403 },
      );
    }

    const body = await req.json();

    // Update settings
    if (body.settings && typeof body.settings === "object") {
      const parsedSettings = z.record(z.string(), settingsValueSchema).safeParse(body.settings);
      if (!parsedSettings.success) {
        return NextResponse.json(
          { error: "Invalid settings values", details: parsedSettings.error.flatten() },
          { status: 422 },
        );
      }
      const entries = Object.entries(parsedSettings.data);
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
      const parsedFeeCap = feeCapBodySchema.safeParse(body.feeCap);
      if (!parsedFeeCap.success) {
        return NextResponse.json(
          { error: "Invalid fee cap", details: parsedFeeCap.error.flatten() },
          { status: 422 },
        );
      }
      const { effectiveDate, capAmount, notes } = parsedFeeCap.data;
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
      const parsedId = z.coerce.number().int().positive().safeParse(body.deleteFeeCap);
      if (!parsedId.success) {
        return NextResponse.json({ error: "Invalid deleteFeeCap id" }, { status: 422 });
      }
      await db
        .delete(feeCapHistory)
        .where(eq(feeCapHistory.id, parsedId.data));
      return NextResponse.json({ status: "ok", deleted: parsedId.data });
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
