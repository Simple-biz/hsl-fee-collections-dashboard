// Node-only half of the access-refresh mechanism. Reads the database, so it
// must never be imported by auth.config.ts / proxy.ts — see version.ts for the
// edge-safe constant and the staleness test.

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, userAccessOverrides } from "@/lib/db/schema";
import { resolveAccess } from "@/lib/access/server";
import { ACCESS_SCHEMA_VERSION, shouldRefreshAccess } from "@/lib/access/version";

export interface RefreshableToken {
  id?: string;
  role?: string;
  pages?: unknown;
  capabilities?: unknown;
  accessVersion?: number;
  mustChangePassword?: boolean;
  /** ISO timestamp — GREATEST(users.updated_at, user_access_overrides.updated_at). */
  accessStamp?: string;
}

/**
 * Bring a token's baked-in access up to the current schema, in place.
 *
 * A no-op when the token is already current or can't be re-resolved. On a
 * database failure the token is left untouched: the user keeps their previous
 * access — stale, but coherent — and the next request tries again.
 */
export const refreshAccessIfStale = async <T extends RefreshableToken>(token: T): Promise<T> => {
  if (!shouldRefreshAccess(token)) return token;

  const userId = Number(token.id);
  try {
    // Re-resolve from the database rather than from role defaults alone:
    // per-user overrides may *revoke* a capability, and rebuilding from
    // defaults would silently grant it back.
    const { pages, capabilities } = await resolveAccess(userId, token.role);
    token.pages = pages;
    token.capabilities = capabilities;
    token.accessVersion = ACCESS_SCHEMA_VERSION;
  } catch (error) {
    console.error("Failed to refresh access for user", userId, error);
  }
  return token;
};

/**
 * Per-user access check — runs on every subsequent request (not just when the
 * schema version changes). Detects three cases that the schema-version stamp
 * (#466) deliberately does not cover:
 *
 *   1. Deactivation — isActive set to false → return null to end the session.
 *   2. Role change — admin demoted to member → re-resolve and re-stamp.
 *   3. Override edit — page/capability added or removed → re-resolve and re-stamp.
 *
 * The stamp is GREATEST(users.updated_at, user_access_overrides.updated_at),
 * computed once at sign-in and compared on every request. The query costs
 * ~0.13 ms on the co-located Neon instance and needs no new index.
 *
 * On DB failure the token is left untouched (stale but coherent) so a transient
 * error never kicks a valid user out. Returns null only when the user row is
 * missing or isActive is false.
 */
export const refreshAccessIfChanged = async <T extends RefreshableToken>(
  token: T,
): Promise<T | null> => {
  const userId = Number(token.id);
  if (!token.id || !Number.isFinite(userId)) return token;

  let row:
    | {
        isActive: boolean;
        role: string;
        updatedAt: Date;
        overrideUpdatedAt: Date | null;
        mustChangePassword: boolean;
      }
    | undefined;

  try {
    [row] = await db
      .select({
        isActive: users.isActive,
        role: users.role,
        updatedAt: users.updatedAt,
        overrideUpdatedAt: userAccessOverrides.updatedAt,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .leftJoin(userAccessOverrides, eq(userAccessOverrides.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
  } catch (error) {
    console.error("Failed to check user access stamp for user", userId, error);
    return token;
  }

  if (!row) return null;
  if (!row.isActive) return null;

  const greatest =
    row.overrideUpdatedAt !== null && row.overrideUpdatedAt > row.updatedAt
      ? row.overrideUpdatedAt
      : row.updatedAt;
  const currentStamp = greatest.toISOString();

  if (token.accessStamp === currentStamp) return token;

  // Access changed — re-resolve and re-stamp. Bumping accessVersion prevents
  // refreshAccessIfStale from doing a redundant second resolve on this request.
  try {
    const { pages, capabilities } = await resolveAccess(userId, row.role);
    token.role = row.role;
    token.pages = pages;
    token.capabilities = capabilities;
    token.accessStamp = currentStamp;
    token.accessVersion = ACCESS_SCHEMA_VERSION;
    token.mustChangePassword = row.mustChangePassword;
  } catch (error) {
    console.error("Failed to re-resolve access for user", userId, error);
    // Don't update the stamp — next request will retry.
  }

  return token;
};
