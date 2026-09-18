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

  // The row's value may be a legacy spelling of an option that's still in the
  // list — `FEE_PETITION` where the list has `FEE PETITION`. Formatting makes
  // both read "Fee Petition", so listing them separately would show the same
  // label twice with no way to tell them apart. Collapse to one entry carrying
  // the row's own value, so the trigger still matches (Listbox finds the
  // selected option by `value`) and re-picking it is a no-op rather than a
  // silent rewrite. Once the stored spellings are reconciled — the data half of
  // #454 — no row reaches this branch.
  const collapsedInto = current
    ? active.find((o) => o.name !== current && label(o.name) === label(current))
    : undefined;

  if (current && !active.some((o) => o.name === current) && !collapsedInto) {
    opts.push({ value: current, label: label(current), ...visual?.(current) });
  }
  for (const o of active) {
    const isCollapseTarget = o.name === collapsedInto?.name;
    opts.push({
      value: isCollapseTarget ? current : o.name,
      label: label(o.name),
      tint: tint?.(o.name),
      ...visual?.(o.name),
    });
  }
  return opts;
}
