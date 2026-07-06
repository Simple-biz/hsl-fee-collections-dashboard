/**
 * Canonical list of dropdown-option categories that back the fee-collections
 * worksheet columns. Keys match the `category` column in `dropdown_options`
 * and are used by both the settings UI (sub-tab navigation) and the
 * /api/settings/dropdown-options route (validation + filtering).
 */
export const DROPDOWN_CATEGORIES = [
  { key: "approved_by", label: "Approved By", description: "Reviewer who signed off on the fee record." },
  { key: "assigned_to", label: "Assigned To", description: "Team member handling the case." },
  { key: "case_level", label: "Case Level", description: "Stage of the case (initial, recon, hearing, etc.)." },
  { key: "claim_type", label: "Claim Type", description: "Benefit type for the claim (T2, T16, CONC, etc.)." },
  { key: "win_sheet_status", label: "Win Sheet Status", description: "Win-sheet progress states." },
  { key: "fees_confirmation", label: "PIF", description: "Paid-in-full confirmation status." },
  { key: "fees_closed", label: "Fees Closed", description: "Trigger for closing a case from the fee collections dashboard." },
  { key: "case_status", label: "Remarks", description: "Remarks/status notes shown in the dashboard." },
  { key: "team", label: "Team", description: "Team groupings for scoreboard tracking (e.g. T2, T16, Concurrent)." },
] as const;

export type DropdownCategory = (typeof DROPDOWN_CATEGORIES)[number]["key"];

export const DROPDOWN_CATEGORY_KEYS = DROPDOWN_CATEGORIES.map((c) => c.key) as readonly DropdownCategory[];

export const isDropdownCategory = (value: string): value is DropdownCategory =>
  (DROPDOWN_CATEGORY_KEYS as readonly string[]).includes(value);

export const getDropdownCategoryLabel = (key: DropdownCategory): string =>
  DROPDOWN_CATEGORIES.find((c) => c.key === key)?.label ?? key;
