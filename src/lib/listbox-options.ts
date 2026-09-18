import type { ApprovedByOption } from "@/types";
import type { ListboxOption } from "@/components/shared/Listbox";

// Shared shape for admin-managed dropdown lists rendered as a Listbox: an
// empty "clear" option, the row's current value if it's since fallen out of
// the admin-managed list, then the active admin options — same precedence
// the native <select> version used. `visual` adds an icon chip (Case Level);
// `tint` colors an option's whole row (Approved By leaders, by team).
//
// `formatLabel` changes only what's shown; `value` stays the stored string, so
// saving is unaffected. Without it the dropdown renders the raw value, which is
// how `FEE_PETITION` and `not_started` reached the UI — the stored data holds
// several spellings of the same thing (see #454).
export function buildListboxOptions(
  adminOptions: ApprovedByOption[],
  current: string,
  visual?: (name: string) => Partial<ListboxOption> | undefined,
  tint?: (name: string) => string | undefined,
  formatLabel?: (name: string) => string,
): ListboxOption[] {
  const label = (name: string) => formatLabel?.(name) || name;
  const active = adminOptions.filter((o) => o.isActive || o.name === current);
  const opts: ListboxOption[] = [{ value: "", label: "— Select —" }];
  if (current && !active.some((o) => o.name === current)) {
    opts.push({ value: current, label: label(current), ...visual?.(current) });
  }
  for (const o of active) {
    opts.push({
      value: o.name,
      label: label(o.name),
      tint: tint?.(o.name),
      ...visual?.(o.name),
    });
  }
  return opts;
}
