// Node-only half of the access-refresh mechanism. Reads the database, so it
// must never be imported by auth.config.ts / proxy.ts — see version.ts for the
// edge-safe constant and the staleness test.

import "server-only";

import { resolveAccess } from "@/lib/access/server";
import { ACCESS_SCHEMA_VERSION, shouldRefreshAccess } from "@/lib/access/version";

export interface RefreshableToken {
  id?: string;
  role?: string;
  pages?: unknown;
  capabilities?: unknown;
  accessVersion?: number;
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
