// ============================================================================
// Access resolution — combine role defaults with per-user overrides.
//
// Pure functions only (no DB) so this is edge-safe. The DB read that loads a
// user's overrides lives in ./server.ts.
// ============================================================================

import type { PageKey } from "./pages";
import { rolePageDefaults } from "./role-defaults";
import type { CapabilityKey } from "./capabilities";
import { roleCapabilityDefaults } from "./capabilities";

// Per-user overrides store ONLY deviations from the role default:
//   pages[key] === true  → grant a page the role default doesn't include
//   pages[key] === false → revoke a page the role default includes
// The same grant/revoke model applies to `capabilities`.
export type PageOverrides = Partial<Record<PageKey, boolean>>;
export type CapabilityOverrides = Partial<Record<CapabilityKey, boolean>>;
export interface AccessOverrides {
  pages?: PageOverrides;
  capabilities?: CapabilityOverrides;
}

const isAdminRole = (role: string | null | undefined): boolean =>
  role === "admin" || role === "system_admin";

// These pages have no partial-access model — their route (and API, for
// Settings) checks the literal admin/system_admin role server-side, not page
// access or a capability. Granting them via a per-user override would show
// the page in the sidebar and let navigation start, but every subsequent
// server check would still reject a non-admin — a page override can never
// actually make these usable, so it must never be offered as one.
const ADMIN_ONLY_PAGES: readonly PageKey[] = ["admin", "archive", "settings"];

/** Effective set of pages a user may open: role default ⊕ overrides. */
export const effectivePages = (
  role: string | null | undefined,
  overrides?: AccessOverrides | null,
): PageKey[] => {
  const set = new Set<PageKey>(rolePageDefaults(role));
  const pageOverrides = overrides?.pages ?? {};
  for (const [key, granted] of Object.entries(pageOverrides)) {
    if (granted) set.add(key as PageKey);
    else set.delete(key as PageKey);
  }
  if (!isAdminRole(role)) {
    for (const key of ADMIN_ONLY_PAGES) set.delete(key);
  }
  return [...set];
};

/** True iff `key` is in the user's effective page set. */
export const hasPageAccess = (
  pages: readonly string[] | null | undefined,
  key: PageKey,
): boolean => (pages ?? []).includes(key);

/**
 * The pages array to check against for a guard, given a session's baked-in
 * `pages` (possibly empty/missing on a token minted before per-page access
 * existed) and the user's role. Falls back to the role's defaults for a
 * stale token, mirroring `sessionHasCapability`'s identical handling.
 */
export const effectivePagesForSession = (
  pages: readonly PageKey[] | null | undefined,
  role: string | null | undefined,
): PageKey[] => (pages && pages.length > 0 ? [...pages] : rolePageDefaults(role));

/** Effective set of capabilities a user has: role default ⊕ overrides. */
export const effectiveCapabilities = (
  role: string | null | undefined,
  overrides?: AccessOverrides | null,
): CapabilityKey[] => {
  const set = new Set<CapabilityKey>(roleCapabilityDefaults(role));
  const capOverrides = overrides?.capabilities ?? {};
  for (const [key, granted] of Object.entries(capOverrides)) {
    if (granted) set.add(key as CapabilityKey);
    else set.delete(key as CapabilityKey);
  }
  return [...set];
};

/** True iff `key` is in the user's effective capability set. */
export const hasCapability = (
  capabilities: readonly string[] | null | undefined,
  key: CapabilityKey,
): boolean => (capabilities ?? []).includes(key);
