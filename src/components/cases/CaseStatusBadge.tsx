// Keyed on both the dropdown-configured categories and the pre-dropdown
// free-text values still sitting on older fee_records rows (e.g. "Ready for
// Review" vs. the current "Ready for Review (Specialist)"). One-off custom
// remarks not listed here fall through to the neutral fallback below.
const CASE_STATUS_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "Ready for Review (Specialist)": { badge: "bg-green-50 text-green-700 border-green-300",     badgeDark: "bg-green-900/40 text-green-300 border-green-700"   },
  "Ready for Review":              { badge: "bg-blue-50 text-blue-700 border-blue-300",         badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"       },
  "Pending for Review":            { badge: "bg-blue-50 text-blue-700 border-blue-300",         badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"       },
  "Reviewing (Management)":        { badge: "bg-violet-50 text-violet-700 border-violet-300",   badgeDark: "bg-violet-900/40 text-violet-300 border-violet-700" },
  "For follow up":                 { badge: "bg-amber-50 text-amber-700 border-amber-300",       badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"    },
  "For follow-up":                 { badge: "bg-amber-50 text-amber-700 border-amber-300",       badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"    },
  "Overpaid but ready to close":   { badge: "bg-amber-50 text-amber-700 border-amber-300",       badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"    },
  "Not ready to close":            { badge: "bg-red-50 text-red-700 border-red-300",             badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "Incomplete win sheet":          { badge: "bg-red-50 text-red-700 border-red-300",             badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "Missing fees":                  { badge: "bg-red-50 text-red-700 border-red-300",             badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "NEED AUX FEE":                  { badge: "bg-red-50 text-red-700 border-red-300",             badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
  "FEE PETITION APPROVED":         { badge: "bg-red-50 text-red-700 border-red-300",             badgeDark: "bg-red-900/40 text-red-300 border-red-700"          },
};
const CASE_STATUS_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

export function CaseStatusBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = CASE_STATUS_COLORS[value] ?? CASE_STATUS_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}
