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
  {
    key: "fees.edit",
    label: "Edit fee amounts",
    description: "Record fees received and manage fee payment records.",
  },
  {
    key: "dailyMetrics.editOthers",
    label: "Log calls for other agents",
    description: "Edit any agent's daily call log, not just their own — includes bulk CSV import.",
  },
  {
    key: "leaderNotes.access",
    label: "View & post leader notes",
    description: "See and add to the leader-only notes thread on a case — hidden from members entirely.",
  },
  {
    key: "feesConfirmation.edit",
    label: "Edit PIF",
    description: "Change the PIF dropdown on a case. Doesn't include Fees Closed, which stays admin-only.",
  },
] as const;

export type CapabilityKey = (typeof CAPABILITIES)[number]["key"];

export const CAPABILITY_KEYS: CapabilityKey[] = CAPABILITIES.map((c) => c.key);

// Mirrors AccessRole in role-defaults.ts.
type Role = "system_admin" | "admin" | "lead" | "member";

const ALL: CapabilityKey[] = CAPABILITY_KEYS;

// Role → default capabilities.
//
// - system_admin: everything.
// - admin: everything EXCEPT fees.edit and feesConfirmation.edit. Both are
//   granted per-user only (via userAccessOverrides) to keep fees received and
//   PIF entry under a single owner.
// - lead: full update incl. finalize + PII + logging calls for others +
//   leader notes, but NOT create, delete, editing fee amounts received,
//   PIF, or Fees Closed (stays admin-only).
// - member: day-to-day collections — update (record payments, status, notes)
//   only, and only their own daily call log. No create/delete, no finalize
//   (close/overpaid/approvedBy), no PII, no leader notes, no Fees
//   Confirmation. Admins can widen any of these per-user via the access
//   overrides modal.
export const ROLE_CAPABILITY_DEFAULTS: Record<Role, CapabilityKey[]> = {
  system_admin: ALL,
  admin: ALL.filter((k) => k !== "fees.edit" && k !== "feesConfirmation.edit"),
  lead: ["case.update", "case.finalize", "case.editPii", "dailyMetrics.editOthers", "leaderNotes.access"],
  member: ["case.update"],
};

export const roleCapabilityDefaults = (
  role: string | null | undefined,
): CapabilityKey[] =>
  ROLE_CAPABILITY_DEFAULTS[(role as Role) ?? "member"] ??
  ROLE_CAPABILITY_DEFAULTS.member;
