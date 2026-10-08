const CLAIM_TYPE_COLORS: Record<string, { badge: string; badgeDark: string }> = {
  "T16":  { badge: "bg-blue-50 text-blue-700 border-blue-300",         badgeDark: "bg-blue-900/40 text-blue-300 border-blue-700"       },
  "T2":   { badge: "bg-violet-50 text-violet-700 border-violet-300",   badgeDark: "bg-violet-900/40 text-violet-300 border-violet-700" },
  "CONC": { badge: "bg-amber-50 text-amber-700 border-amber-300",       badgeDark: "bg-amber-900/40 text-amber-300 border-amber-700"   },
};
const CLAIM_TYPE_FALLBACK = { badge: "bg-neutral-100 text-neutral-500 border-neutral-300", badgeDark: "bg-neutral-700 text-neutral-300 border-neutral-600" };

export function ClaimTypeBadge({ value, dark }: { value: string | null | undefined; dark: boolean }) {
  if (!value) return <span className="text-neutral-400">—</span>;
  const colors = CLAIM_TYPE_COLORS[value] ?? CLAIM_TYPE_FALLBACK;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium border whitespace-nowrap ${dark ? colors.badgeDark : colors.badge}`}>
      {value}
    </span>
  );
}
