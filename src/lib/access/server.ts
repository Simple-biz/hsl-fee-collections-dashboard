import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAccessOverrides } from "@/lib/db/schema";
import { effectivePages, type AccessOverrides } from "./resolve";
import type { PageKey } from "./pages";

// ============================================================================
// Server-only access helpers — the DB-reading side of the access layer.
// Kept out of the edge bundle (auth.config.ts must not import this).
// ============================================================================

/** Load a user's raw override blob (deviations from their role default). */
export const loadAccessOverrides = async (
  userId: number,
): Promise<AccessOverrides> => {
  const [row] = await db
    .select({ overrides: userAccessOverrides.overrides })
    .from(userAccessOverrides)
    .where(eq(userAccessOverrides.userId, userId))
    .limit(1);
  return (row?.overrides as AccessOverrides) ?? {};
};

/** Resolve the effective page set for a user (role default ⊕ overrides). */
export const resolveEffectivePages = async (
  userId: number,
  role: string,
): Promise<PageKey[]> => {
  const overrides = await loadAccessOverrides(userId);
  return effectivePages(role, overrides);
};
