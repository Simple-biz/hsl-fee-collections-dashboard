// ============================================================================
// Capability registry — the catalog of action-level permissions.
//
// Pages (./pages.ts) gate which screens a user can OPEN; capabilities gate what
// a user can DO once there. Like pages, this is pure data + helpers (no DB, no
// Node APIs) so it's safe to import from the edge `auth.config.ts` and from
// client components.
//
// Capabilities are resolved as role default ⊕ per-user overrides (see
// ./resolve.ts) and baked into the JWT at sign-in alongside `pages`.
// ============================================================================

export const CAPABILITIES = [
  {
    key: "case.create",
    label: "Create cases",
    description: "Add new cases to the dashboard.",
  },
  {
    key: "case.delete",
    label: "Delete cases",
    description: "Permanently delete a case and its records.",
  },
  {
    key: "case.update",
    label: "Update cases",
    description: "Edit case details, fee amounts, status, and notes.",
  },
  {
    key: "case.finalize",
    label: "Finalize cases",
    description:
      "Close/reopen cases, mark overpaid, and set “Approved by (OK to close)”.",
  },
  {
    key: "case.editPii",
    label: "Edit client PII",
    description: "Edit sensitive client details (SSN and identity fields).",
  },
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];

export const CAPABILITY_KEYS: CapabilityKey[] = CAPABILITIES.map((c) => c.key);

// Mirrors AccessRole in role-defaults.ts.
type Role = "system_admin" | "admin" | "lead" | "member";

const ALL: CapabilityKey[] = CAPABILITY_KEYS;

// Role → default capabilities.
//
// - admin / system_admin: everything.
// - lead: full update incl. finalize + PII, but NOT create or delete.
// - member: day-to-day collections — update (record payments, status, notes)
//   only. No create/delete, no finalize (close/overpaid/approvedBy), no PII.
//   Admins can widen any of these per-user via the access overrides modal.
export const ROLE_CAPABILITY_DEFAULTS: Record<Role, CapabilityKey[]> = {
  system_admin: ALL,
  admin: ALL,
  lead: ["case.update", "case.finalize", "case.editPii"],
  member: ["case.update"],
};

export const roleCapabilityDefaults = (
  role: string | null | undefined,
): CapabilityKey[] =>
  ROLE_CAPABILITY_DEFAULTS[(role as Role) ?? "member"] ??
  ROLE_CAPABILITY_DEFAULTS.member;
