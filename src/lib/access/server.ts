import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userAccessOverrides } from "@/lib/db/schema";
import {
  effectivePages,
  effectiveCapabilities,
  type AccessOverrides,
} from "./resolve";
import type { PageKey } from "./pages";
import type { CapabilityKey } from "./capabilities";

// ============================================================================
// Server-only access helpers — the DB-reading side of the access layer.
// Kept out of the edge bundle (auth.config.ts must not import this).
// ============================================================================

/** Single authoritative read of a user's access override row. */
const queryAccessRow = async (userId: number) => {
  const [row] = await db
    .select({
      overrides: userAccessOverrides.overrides,
      updatedAt: userAccessOverrides.updatedAt,
    })
    .from(userAccessOverrides)
    .where(eq(userAccessOverrides.userId, userId))
    .limit(1);
  return row;
};

/**
 * Resolve both the effective page set AND capability set in a single override
 * read — used at sign-in so the JWT can carry both without two DB round-trips.
 * Also returns the override row's updatedAt so callers can compute the
 * per-user access stamp without a second query.
 */
export const resolveAccess = async (
  userId: number,
  role: string,
): Promise<{ pages: PageKey[]; capabilities: CapabilityKey[]; overrideUpdatedAt: Date | null }> => {
  const row = await queryAccessRow(userId);
  const overrides = (row?.overrides as AccessOverrides) ?? {};
  return {
    pages: effectivePages(role, overrides),
    capabilities: effectiveCapabilities(role, overrides),
    overrideUpdatedAt: row?.updatedAt ?? null,
  };
};
