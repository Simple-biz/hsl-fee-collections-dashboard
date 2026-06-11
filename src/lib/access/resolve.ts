// ============================================================================
// Access resolution — combine role defaults with per-user overrides.
//
// Pure functions only (no DB) so this is edge-safe. The DB read that loads a
// user's overrides lives in ./server.ts.
// ============================================================================

import type { PageKey } from "./pages";
import { rolePageDefaults } from "./role-defaults";

// Per-user overrides store ONLY deviations from the role default:
//   pages[key] === true  → grant a page the role default doesn't include
//   pages[key] === false → revoke a page the role default includes
// (A `fields` map will be added here in Phase 2.)
export type PageOverrides = Partial<Record<PageKey, boolean>>;
export interface AccessOverrides {
  pages?: PageOverrides;
}

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
  return [...set];
};

/** True iff `key` is in the user's effective page set. */
export const hasPageAccess = (
  pages: readonly string[] | null | undefined,
  key: PageKey,
): boolean => (pages ?? []).includes(key);
