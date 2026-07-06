const FEES_CONF_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "Yes":         { badge: "bg-emerald-50 text-emerald-700 border-emerald-300",  badgeDark: "bg-emerald-900/40 text-emerald-300 border-emerald-700" },
  "No":          { badge: "bg-red-50 text-red-700 border-red-300",              badgeDark: "bg-red-900/40 text-red-300 border-red-700"             },
  "Pending":     { badge: "bg-blue-50 text-blue-700 border-blue-300",           badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"          },
  "No Fees Due": { badge: "bg-neutral-100 text-black border-neutral-400",        badgeDark: "bg-neutral-800 text-white border-neutral-600"          },
  "Overpaid":    { badge: "bg-amber-50 text-amber-700 border-amber-300",        badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"       },
};
const FEES_CONF_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

export function FeesConfBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = FEES_CONF_COLORS[value] ?? FEES_CONF_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}
