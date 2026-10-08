import { winSheetStatusLabel } from "@/lib/formatters";

// Keyed on what's actually stored in fee_records.win_sheet_status today —
// a mix of the dropdown-configured "Started"/"Finished" and older
// lowercase/underscored values written by the MyCase sync ("not_started",
// "started", "closed").
const WIN_SHEET_STATUS_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "not_started": { badge: "bg-neutral-100 text-neutral-600 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600"   },
  "started":     { badge: "bg-amber-50 text-amber-700 border-amber-300",         badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"       },
  "Started":     { badge: "bg-amber-50 text-amber-700 border-amber-300",         badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"       },
  "closed":      { badge: "bg-emerald-50 text-emerald-700 border-emerald-300",   badgeDark: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
  "Finished":    { badge: "bg-emerald-50 text-emerald-700 border-emerald-300",   badgeDark: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
};
const WIN_SHEET_STATUS_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

export function WinSheetStatusBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  // Colours stay keyed on the stored value — the same status is stored several
  // ways ("Started"/"started", "not_started") and each spelling needs its own
  // key — but only the formatted label is shown.
  const colors = WIN_SHEET_STATUS_COLORS[value] ?? WIN_SHEET_STATUS_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {winSheetStatusLabel(value)}
    </span>
  );
}
