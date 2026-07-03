// ============================================================================
// Role → default page access.
//
// Defaults live in code (version-controlled). Per-user overrides in the DB
// deviate from these; the admin UI shows a dot where a user differs from the
// default, and "Apply Role Defaults" clears the user's overrides back to here.
//
// Pure data — safe to import from the edge.
// ============================================================================

import type { PageKey } from "./pages";
import { PAGE_KEYS } from "./pages";

// Mirrors the UserRole union in next-auth.d.ts.
export type AccessRole = "system_admin" | "admin" | "lead" | "member";

const ALL: PageKey[] = PAGE_KEYS;

export const ROLE_PAGE_DEFAULTS: Record<AccessRole, PageKey[]> = {
  // Full access.
  system_admin: ALL,
  admin: ALL,
  // Everything operational except user management + app settings.
  lead: PAGE_KEYS.filter((k) => k !== "admin" && k !== "settings" && k !== "archive"),
  // Front-line collections pages only.
  member: ["overview", "master_fees", "fees_closed", "fee_petitions", "scoreboard", "reports", "notifications", "inbound_calls"],
};

export const rolePageDefaults = (role: string | null | undefined): PageKey[] =>
  ROLE_PAGE_DEFAULTS[(role as AccessRole) ?? "member"] ??
  ROLE_PAGE_DEFAULTS.member;
