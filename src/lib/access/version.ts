// ============================================================================
// Access schema version.
//
// Pages and capabilities are resolved once at sign-in and baked into the JWT,
// so a signed-in user keeps whatever set existed when they logged in. Sessions
// last 30 days, which meant adding a capability left existing users without it
// until they next signed in — #464 shipped `feePetition.manage` and admins were
// denied their own feature until they re-authenticated (#466).
//
// This constant is the signal that a token's baked-in access is out of date.
// The Node-side `jwt` callback in auth.ts compares it against the token's stamp
// and re-resolves from the database when they differ.
//
// **Bump this whenever the access model changes** — a key added to or removed
// from PAGES or CAPABILITIES, or a change to the role defaults in
// role-defaults.ts / capabilities.ts. Forgetting to bump it doesn't break
// anything; it just means existing sessions keep the old set until their next
// login, which is the behaviour this exists to avoid.
//
// Pure data with no imports, so it stays safe for the edge config.
// ============================================================================

export const ACCESS_SCHEMA_VERSION = 1;

/** The parts of a JWT this module needs. Structural, so it stays edge-safe. */
interface AccessToken {
  id?: string;
  role?: string;
  pages?: unknown;
  capabilities?: unknown;
  accessVersion?: number;
}

/**
 * Whether a token's baked-in access predates the current schema and can be
 * refreshed. False when it's already current, or when the token lacks the id
 * or role needed to re-resolve — an anonymous or half-built token is left
 * alone rather than being given a default set it didn't earn.
 */
export const shouldRefreshAccess = <T extends AccessToken>(
  token: T,
): token is T & { role: string } => {
  if (token.accessVersion === ACCESS_SCHEMA_VERSION) return false;
  if (!token.role) return false;
  return Number.isFinite(Number(token.id));
};

/**
 * Computes the per-user access stamp: GREATEST(users.updated_at, uao.updated_at).
 * A single canonical implementation shared by sign-in (auth.ts) and the
 * per-request check (refresh.ts) so they can't drift.
 */
export const computeAccessStamp = (
  updatedAt: Date,
  overrideUpdatedAt: Date | null,
): string =>
  (overrideUpdatedAt !== null && overrideUpdatedAt > updatedAt
    ? overrideUpdatedAt
    : updatedAt).toISOString();
