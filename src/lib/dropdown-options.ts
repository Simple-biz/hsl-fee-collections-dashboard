import type { ApprovedByOption } from "@/types";
import type { DropdownCategory } from "@/lib/dropdown-categories";

export type DropdownOptionsByCategory = Partial<
  Record<DropdownCategory, ApprovedByOption[]>
>;

// Groups the flat /api/settings/dropdown-options row list by category, for
// fast per-cell lookup in inline-editable dropdowns.
export const groupDropdownOptions = (
  rows: (ApprovedByOption & { category: DropdownCategory })[],
): DropdownOptionsByCategory => {
  const grouped: DropdownOptionsByCategory = {};
  for (const o of rows) {
    (grouped[o.category] ||= []).push(o);
  }
  return grouped;
};

// Fetches every dropdown-option category in one round trip and groups it.
// Returns {} on a non-OK response — callers treat an empty category as "no
// options configured yet", which every inline dropdown already renders
// gracefully (just "— Select —" plus the current value). Does NOT catch
// fetch errors itself (including AbortError) — that's left to the caller,
// which needs to distinguish "aborted, don't touch state" from "real
// failure, fall back to {}" per this codebase's AbortController convention.
export const fetchDropdownOptions = async (
  signal?: AbortSignal,
): Promise<DropdownOptionsByCategory> => {
  const res = await fetch("/api/settings/dropdown-options", { signal });
  if (!res.ok) return {};
  const json = await res.json();
  const rows: (ApprovedByOption & { category: DropdownCategory })[] = json.data || [];
  return groupDropdownOptions(rows);
};
