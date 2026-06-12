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
